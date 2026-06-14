/**
 * Demo seed — creates a known test user and rich sample data via the running API.
 *
 * Prereq: Docker Postgres up + backend running on http://localhost:3030
 *   docker compose up -d
 *   npm run dev            (or: TS_NODE_TRANSPILE_ONLY=true npx ts-node src/server.ts)
 *
 * Run:  node scripts/seed-demo.mjs
 *
 * Safe to re-run: existing records (409 conflicts) are skipped.
 *
 * Login created:
 *   email:    demo@grc.local
 *   password: Test1234!
 *   role:     admin (owns + tests the controls, so every page has data)
 */

const API = process.env.API_URL || "http://localhost:3030/api";
const EMAIL = "demo@grc.local";
const PASSWORD = "Test1234!";

const now = new Date();
const period = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
const nextMonth15 = new Date(now.getFullYear(), now.getMonth() + 1, 15)
  .toISOString()
  .slice(0, 10);

async function api(method, path, token, body) {
  const res = await fetch(API + path, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: "Bearer " + token } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try {
    json = await res.json();
  } catch {}
  return [res.status, json];
}

async function uploadEvidence(token, name, text) {
  const fd = new FormData();
  fd.append(
    "test_evidence",
    new Blob([text], { type: "application/pdf" }),
    name,
  );
  const res = await fetch(API + "/uploads/test-evidence-multiple", {
    method: "POST",
    headers: { Authorization: "Bearer " + token },
    body: fd,
  });
  const json = await res.json().catch(() => null);
  return json?.data?.map((f) => f.url) ?? [];
}

async function main() {
  // ── 1. Auth: register, or log in if the demo user already exists ──
  let [st, r] = await api("POST", "/auth/register", null, {
    email: EMAIL,
    password: PASSWORD,
    fullName: "Demo Admin",
    companyName: "Acme Compliance Ltd",
  });
  if (st === 409) {
    [st, r] = await api("POST", "/auth/login", null, {
      email: EMAIL,
      password: PASSWORD,
    });
    console.log("• Demo user already existed — logged in.");
  } else {
    console.log("• Created demo user.");
  }
  if (!r?.data?.accessToken) {
    console.error("Auth failed:", st, r);
    process.exit(1);
  }
  const token = r.data.accessToken;
  const uid = r.data.user.id;

  // ── 2. Countries (entities) ──
  const countries = {};
  for (const c of [
    { name: "Nigeria", code: "NG" },
    { name: "Kenya", code: "KE" },
  ]) {
    let [cs, cr] = await api("POST", "/settings/countries", token, c);
    if (cs === 201) countries[c.code] = cr.data.id;
    else {
      // already exists — fetch the list to grab its id
      const [, list] = await api("GET", "/settings/countries", token);
      countries[c.code] = list.data.find((x) => x.code === c.code)?.id;
    }
  }
  console.log("• Countries ready:", Object.keys(countries).join(", "));

  // ── 3. Controls (varied domains/frequencies; natural-sort + calendar demo) ──
  const base = {
    risk: "High",
    nature: "manual",
    type: "preventive",
    ownerId: uid,
    testerId: uid,
  };
  const controlDefs = [
    { controlId: "1.1", name: "Expenditure approval", description: "All expenditure above threshold must be approved by finance.", domain: "Expenditure", frequency: "monthly", countryId: countries.NG, testDueDay: 10 },
    { controlId: "1.2", name: "Petty cash review", description: "Monthly petty cash reconciliation and sign-off.", domain: "Expenditure", frequency: "monthly", countryId: countries.NG, testDueDay: 5 },
    { controlId: "1.10", name: "Vendor payment controls", description: "Vendor bank details verified before payment run.", domain: "Expenditure", frequency: "monthly", countryId: countries.NG, testDueDate: nextMonth15 },
    { controlId: "2.1", name: "User access review", description: "Quarterly review of system user access rights.", domain: "IT", frequency: "monthly", countryId: countries.NG, testDueDay: 15 },
    { controlId: "2.2", name: "Backup verification", description: "Daily backups verified and restorable.", domain: "IT", frequency: "monthly", countryId: countries.NG, testDueDay: 20 },
    { controlId: "3.1", name: "Revenue recognition", description: "Revenue recognised in line with policy.", domain: "Revenue", frequency: "quarterly", countryId: countries.NG, testDueDay: 25 },
    { controlId: "4.1", name: "Payroll approval", description: "Payroll reviewed and approved before disbursement.", domain: "HR", frequency: "monthly", countryId: countries.NG, testDueDay: 28 },
    { controlId: "5.1", name: "Treasury reconciliation", description: "Bank reconciliations completed monthly.", domain: "Treasury", frequency: "monthly", countryId: countries.NG, testDueDay: 12 },
    { controlId: "2.3", name: "Patch management (KE)", description: "Security patches applied within SLA.", domain: "IT", frequency: "monthly", countryId: countries.KE, testDueDay: 18 },
  ];

  const controlIds = {}; // controlId -> db id
  for (const def of controlDefs) {
    const [cs, cr] = await api("POST", "/settings/controls", token, {
      ...base,
      ...def,
      status: "active",
    });
    if (cs === 201) controlIds[def.controlId] = cr.data.id;
  }
  // fetch full list to resolve ids (covers re-run case where create returned 409)
  const [, allControls] = await api("GET", "/settings/controls", token);
  for (const c of allControls.data) controlIds[c.controlId] = c.id;
  console.log(`• Controls ready: ${controlDefs.length} defined.`);

  // ── 4. Upload real evidence files so "view evidence" works ──
  const ev1 = await uploadEvidence(token, "approval-memo.pdf", "Demo approval memo evidence");
  const ev2 = await uploadEvidence(token, "bank-statement.pdf", "Demo bank statement evidence");
  const ev3 = await uploadEvidence(token, "access-log.pdf", "Demo access log evidence");

  // ── 5. Log tests for this period (pass / exception / fail) ──
  const tests = [
    { cid: "1.1", testName: "Expenditure approval test", population: 120, sampleSize: 25, exceptions: 0, result: "pass",
      comments: "All sampled expenditures were properly approved.", recommendation: "Maintain current approval matrix.", evidenceUrls: ev1 },
    { cid: "1.2", testName: "Petty cash review test", population: 30, sampleSize: 30, exceptions: 3, result: "exception",
      comments: "Three petty cash vouchers lacked supporting receipts.", recommendation: "Enforce receipt attachment before reimbursement.", evidenceUrls: [...ev1, ...ev2] },
    { cid: "2.1", testName: "User access review test", population: 200, sampleSize: 40, exceptions: 6, result: "fail",
      comments: "Six terminated users still had active accounts.", recommendation: "Automate de-provisioning on HR exit trigger.", evidenceUrls: ev3 },
    { cid: "5.1", testName: "Treasury reconciliation test", population: 12, sampleSize: 12, exceptions: 0, result: "pass",
      comments: "All bank reconciliations completed on time.", recommendation: "No action required.", evidenceUrls: ev2 },
    // 2.2, 4.1 left untested → show as pending/overdue in the test plan & dashboard
  ];

  let logged = 0;
  for (const t of tests) {
    const dbId = controlIds[t.cid];
    if (!dbId) continue;
    const [ls] = await api("POST", "/testing/log", token, {
      controlId: dbId,
      countryId: countries.NG,
      period,
      testName: t.testName,
      population: t.population,
      sampleSize: t.sampleSize,
      exceptions: t.exceptions,
      result: t.result,
      testProcedure: "Sampled transactions and inspected supporting documents.",
      comments: t.comments,
      recommendation: t.recommendation,
      evidenceUrls: t.evidenceUrls,
    });
    if (ls === 201) logged++;
  }
  console.log(`• Logged ${logged} tests for ${period} (exceptions & fails auto-created issues).`);

  console.log("\n========================================");
  console.log("  DEMO DATA READY");
  console.log("========================================");
  console.log("  Login at the frontend with:");
  console.log("    Email:    " + EMAIL);
  console.log("    Password: " + PASSWORD);
  console.log("  Period with data: " + period);
  console.log("  Entities: Nigeria (primary), Kenya");
  console.log("========================================");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
