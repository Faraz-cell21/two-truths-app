import { randomBytes, scryptSync } from "crypto";
import mongoose from "mongoose";

const SCRYPT_PARAMS = {
  N: 16384,
  r: 8,
  p: 1,
  maxmem: 64 * 1024 * 1024,
};

function hashPassword(password) {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, 64, SCRYPT_PARAMS);
  return `scrypt$${salt.toString("base64")}$${hash.toString("base64")}`;
}

function getAdminPath() {
  const raw = (process.env.ADMIN_PATH || "x7k9m2p4").trim();

  if (raw.startsWith("http://") || raw.startsWith("https://")) {
    try {
      const segments = new URL(raw).pathname.split("/").filter(Boolean);
      if (segments.at(-1) === "login") {
        return segments.at(-2) || "x7k9m2p4";
      }
      return segments[0] || "x7k9m2p4";
    } catch {
      return "x7k9m2p4";
    }
  }

  const cleaned = raw.replace(/^\/+|\/+$/g, "");
  return cleaned.split("/").filter(Boolean)[0] || "x7k9m2p4";
}

function getAdminLoginPath() {
  return `/${getAdminPath()}/login`;
}

function getAdminDashboardPath() {
  return `/${getAdminPath()}`;
}

const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
const password = process.env.ADMIN_PASSWORD;
const mongoUri = process.env.MONGODB_URI;

if (!email || !password) {
  console.error("Set ADMIN_EMAIL and ADMIN_PASSWORD in your environment before seeding.");
  process.exit(1);
}

if (!mongoUri) {
  console.error("Set MONGODB_URI in your environment before seeding.");
  process.exit(1);
}

const AdminSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, unique: true },
    passwordHash: { type: String, required: true },
    createdAt: { type: Date, required: true, default: Date.now },
    lastLoginAt: { type: Date, default: null },
  },
  { timestamps: false }
);

const AdminModel =
  mongoose.models.Admin || mongoose.model("Admin", AdminSchema);

await mongoose.connect(mongoUri);

const existingAdmin = await AdminModel.findOne().lean();

if (existingAdmin) {
  await AdminModel.updateOne(
    { _id: existingAdmin._id },
    {
      $set: {
        email,
        passwordHash: hashPassword(password),
      },
    }
  );
  console.log(`Updated admin account for "${email}".`);
} else {
  await AdminModel.create({
    email,
    passwordHash: hashPassword(password),
    createdAt: new Date(),
  });
  console.log(`Seeded admin account for "${email}".`);
}

console.log(`Login path: ${getAdminLoginPath()}`);
console.log(`Dashboard path: ${getAdminDashboardPath()}`);
console.log("Open those paths on whatever host your app is running.");

await mongoose.disconnect();
process.exit(0);
