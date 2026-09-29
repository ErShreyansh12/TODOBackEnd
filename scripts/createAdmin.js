// One-time script to create an admin.
// Usage: node scripts/createAdmin.js "Full Name" admin@example.com "SomePassword"
const mongoose = require('mongoose');
const env = require('../src/config/env');
const Admin = require('../src/models/Admin');

async function main() {
  const [name, email, password] = process.argv.slice(2);

  if (!name || !email || !password) {
    console.error('Usage: node scripts/createAdmin.js "Full Name" admin@example.com "SomePassword"');
    process.exit(1);
  }

  await mongoose.connect(env.mongodbUri);

  const existing = await Admin.findOne({ email: email.toLowerCase() });
  if (existing) {
    console.error(`Admin with email ${email} already exists.`);
    process.exit(1);
  }

  const admin = await Admin.create({ name, email, password });

  console.log('Admin created:');
  console.log({ id: admin._id.toString(), name: admin.name, email: admin.email });

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
