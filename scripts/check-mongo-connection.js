import dns from "node:dns/promises";
import https from "node:https";
import net from "node:net";

import mongoose from "mongoose";

import { env } from "../src/config/env.js";

const TCP_TIMEOUT_MS = 8000;
const MONGOOSE_TEST_TIMEOUT_MS = 22000;

function safeParseMongoUri(uri) {
  const url = new URL(uri.replace(/^mongodb\+srv:/, "mongodb:"));

  return {
    protocol: uri.startsWith("mongodb+srv://") ? "mongodb+srv" : "mongodb",
    host: url.host,
    usernamePresent: Boolean(url.username),
    passwordPresent: Boolean(url.password),
    passwordLength: url.password ? decodeURIComponent(url.password).length : 0,
    database: url.pathname.replace(/^\//, "") || null,
    queryKeys: [...url.searchParams.keys()].sort()
  };
}

function getPublicIp() {
  return new Promise((resolve) => {
    const request = https.get("https://api.ipify.org?format=json", {
      timeout: 5000,
      headers: {
        "user-agent": "BlueMind-Mongo-Diagnostics/1.0"
      }
    }, (response) => {
      let body = "";

      response.on("data", (chunk) => {
        body += chunk;
      });

      response.on("end", () => {
        try {
          resolve(JSON.parse(body).ip || null);
        } catch {
          resolve(null);
        }
      });
    });

    request.on("timeout", () => {
      request.destroy();
      resolve(null);
    });

    request.on("error", () => resolve(null));
  });
}

function testTcp(host, port) {
  return new Promise((resolve) => {
    const startedAt = Date.now();
    const socket = net.createConnection({ host, port });

    socket.setTimeout(TCP_TIMEOUT_MS);

    socket.on("connect", () => {
      socket.destroy();
      resolve({
        host,
        port,
        ok: true,
        durationMs: Date.now() - startedAt
      });
    });

    socket.on("timeout", () => {
      socket.destroy();
      resolve({
        host,
        port,
        ok: false,
        durationMs: Date.now() - startedAt,
        error: "TCP_TIMEOUT"
      });
    });

    socket.on("error", (error) => {
      resolve({
        host,
        port,
        ok: false,
        durationMs: Date.now() - startedAt,
        error: error.code || error.message
      });
    });
  });
}

async function resolveMongoTargets(uriInfo) {
  if (env.mongodbDirectHosts.length) {
    return env.mongodbDirectHosts.map((host) => ({
      host: host.split(":")[0],
      port: Number(host.split(":")[1] || 27017),
      source: "MONGODB_DIRECT_HOSTS"
    }));
  }

  if (uriInfo.protocol === "mongodb+srv") {
    const records = await dns.resolveSrv(`_mongodb._tcp.${uriInfo.host}`);

    return records.map((record) => ({
      host: record.name,
      port: record.port,
      source: "srv"
    }));
  }

  return [{
    host: uriInfo.host.split(":")[0],
    port: Number(uriInfo.host.split(":")[1] || 27017),
    source: "uri"
  }];
}

function buildMongooseUri(uri) {
  if (!env.mongodbDirectHosts.length || !uri.startsWith("mongodb+srv://")) {
    return uri;
  }

  const original = new URL(uri.replace(/^mongodb\+srv:/, "mongodb:"));
  const params = new URLSearchParams(original.search);
  const database = original.pathname.replace(/^\//, "");

  if (!params.has("authSource")) {
    params.set("authSource", env.MONGODB_AUTH_SOURCE);
  }

  if (env.MONGODB_REPLICA_SET && !params.has("replicaSet")) {
    params.set("replicaSet", env.MONGODB_REPLICA_SET);
  }

  if (env.MONGODB_TLS && !params.has("tls") && !params.has("ssl")) {
    params.set("tls", "true");
  }

  return [
    "mongodb://",
    original.username,
    original.password ? `:${original.password}` : "",
    "@",
    env.mongodbDirectHosts.join(","),
    database ? `/${database}` : "",
    "?",
    params.toString()
  ].join("");
}

async function testMongoose(uri) {
  const startedAt = Date.now();
  const timeout = new Promise((_, reject) => {
    setTimeout(() => {
      const error = new Error(`Mongoose connection test timed out after ${MONGOOSE_TEST_TIMEOUT_MS}ms`);
      error.code = "MONGOOSE_TEST_TIMEOUT";
      reject(error);
    }, MONGOOSE_TEST_TIMEOUT_MS);
  });

  try {
    mongoose.set("bufferCommands", false);
    await Promise.race([
      mongoose.connect(uri, {
        autoIndex: false,
        serverSelectionTimeoutMS: env.MONGODB_CONNECT_TIMEOUT_MS,
        connectTimeoutMS: env.MONGODB_CONNECT_TIMEOUT_MS,
        socketTimeoutMS: env.MONGODB_CONNECT_TIMEOUT_MS
      }),
      timeout
    ]);

    return {
      ok: true,
      durationMs: Date.now() - startedAt,
      database: mongoose.connection.name
    };
  } catch (error) {
    return {
      ok: false,
      durationMs: Date.now() - startedAt,
      name: error.name,
      code: error.code,
      syscall: error.syscall,
      hostname: error.hostname,
      message: error.message
    };
  } finally {
    await mongoose.disconnect().catch(() => {});
  }
}

async function main() {
  const uriInfo = safeParseMongoUri(env.MONGODB_URI);
  const publicIp = await getPublicIp();
  const targets = await resolveMongoTargets(uriInfo);
  const tcp = await Promise.all(targets.map((target) => testTcp(target.host, target.port)));
  const mongooseResult = await testMongoose(buildMongooseUri(env.MONGODB_URI));
  const likelyCause = tcp.every((target) => !target.ok)
    ? "TCP_TO_ATLAS_FAILED_CHECK_IP_ACCESS_OR_NETWORK_FIREWALL"
    : mongooseResult.ok
      ? "MONGODB_CONNECTED"
      : "TCP_WORKS_BUT_MONGOOSE_FAILED_CHECK_CREDENTIALS_OR_DATABASE_USER";

  console.log(JSON.stringify({
    uri: uriInfo,
    publicIp,
    dns: {
      srvTargets: targets,
      usingDirectHosts: env.mongodbDirectHosts.length > 0
    },
    tcp,
    mongoose: mongooseResult,
    likelyCause,
    recommendations: [
      "If all TCP checks fail, add the current public IP to MongoDB Atlas Network Access or allow outbound TCP 27017.",
      "If TCP works but Mongoose auth fails, verify database username/password and that the password is URL-encoded.",
      "Do not paste the full Mongo URI into logs; this script intentionally prints only safe metadata."
    ]
  }, null, 2));

  process.exitCode = mongooseResult.ok ? 0 : 1;
}

main().catch((error) => {
  console.error(JSON.stringify({
    ok: false,
    name: error.name,
    code: error.code,
    message: error.message
  }, null, 2));
  process.exitCode = 1;
});
