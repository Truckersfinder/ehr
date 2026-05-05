import { storage } from "./storage";
import { hashPassword } from "./auth";
import { endOfDay, startOfDay } from "date-fns";
import type { Appointment } from "@shared/schema";

/** Idempotent: creates demo Security user when DB already has facilities (e.g. after first seed). */
export async function ensureSecurityUser() {
  if (await storage.getUserByUsername("Security123")) return;
  const facs = await storage.getFacilities();
  const facility = facs[0];
  if (!facility) return;
  await storage.createUser({
    username: "Security123",
    password: hashPassword("Security123"),
    fullName: "Systems administrator",
    role: "security",
    facilityId: facility.id,
    email: "security@onehealth.ke",
    phone: "+254700000007",
    isActive: true,
  });
}

/**
 * Marks rows created only for schedule UI demos (idempotent per calendar day in server TZ).
 */
export const DEMO_DOCTOR_SCHEDULE_NOTE = "__demo_doctor_schedule__";

/**
 * Add same-day appointments for Dr. Wanjiku so Schedule is populated after restart.
 * Skipped if demos for today already exist.
 */
export async function ensureDoctorScheduleDemoAppointments(): Promise<void> {
  try {
    const clinician = await storage.getUserByUsername("drwanjiku");
    const facilityId = clinician?.facilityId;
    if (!clinician || !facilityId) return;

    const patients = (await storage.getPatients()).filter(
      (p) => p.facilityId === facilityId && p.isActive !== false,
    );
    if (patients.length === 0) return;

    const dayStart = startOfDay(new Date());
    const dayEnd = endOfDay(new Date());
    const todays = await storage.getAppointments(undefined, dayStart.toISOString(), dayEnd.toISOString());
    if (todays.some((a) => a.notes === DEMO_DOCTOR_SCHEDULE_NOTE)) return;

    type Slot = {
      hour: number;
      minute: number;
      duration: number;
      status: Appointment["status"];
      reason: string;
    };
    const slots: Slot[] = [
      { hour: 8, minute: 15, duration: 20, status: "confirmed", reason: "Medication review" },
      { hour: 11, minute: 0, duration: 30, status: "scheduled", reason: "Chronic disease follow-up" },
      { hour: 12, minute: 30, duration: 30, status: "checked_in", reason: "Pre-operative assessment" },
      { hour: 13, minute: 45, duration: 45, status: "scheduled", reason: "Diabetes counselling" },
      { hour: 15, minute: 45, duration: 30, status: "scheduled", reason: "Post-discharge wound check" },
      { hour: 16, minute: 30, duration: 20, status: "no_show", reason: "Routine vaccination (no-show example)" },
    ];

    for (let idx = 0; idx < slots.length; idx++) {
      const slot = slots[idx];
      const scheduledDate = startOfDay(new Date());
      scheduledDate.setHours(slot.hour, slot.minute, 0, 0);
      const patient = patients[idx % patients.length];
      await storage.createAppointment({
        patientId: patient.id,
        clinicianId: clinician.id,
        facilityId,
        scheduledDate,
        duration: slot.duration,
        status: slot.status,
        reason: slot.reason,
        notes: DEMO_DOCTOR_SCHEDULE_NOTE,
      });
    }

    console.log("[seed] Added demo appointments for today's doctor schedule");
  } catch (err) {
    console.warn("[seed] ensureDoctorScheduleDemoAppointments:", err);
  }
}

export async function seedDatabase() {
  const existingAdmin = await storage.getUserByUsername("admin");
  if (existingAdmin) return;

  const facility = await storage.createFacility({
    name: "Imani",
    code: "IMH-001",
    address: "123 Healthcare Ave, Nairobi",
    phone: "+254700123456",
    email: "admin@onehealth.ke",
    country: "KE",
    isActive: true,
  });

  await storage.createFacility({
    name: "Imani Community Clinic",
    code: "IMC-002",
    address: "45 Mombasa Road, Nairobi",
    phone: "+254700654321",
    email: "clinic@onehealth.ke",
    country: "KE",
    isActive: true,
  });

  const admin = await storage.createUser({
    username: "admin",
    password: hashPassword("admin123"),
    fullName: "Clinic Administrator",
    role: "super_admin",
    facilityId: facility.id,
    email: "admin@onehealth.ke",
    phone: "+254700000001",
    isActive: true,
  });

  const drWanjiku = await storage.createUser({
    username: "drwanjiku",
    password: hashPassword("doctor123"),
    fullName: "Dr. Amina Wanjiku",
    role: "clinician",
    facilityId: facility.id,
    email: "wanjiku@onehealth.ke",
    phone: "+254700000002",
    isActive: true,
  });

  const nurseOmondi = await storage.createUser({
    username: "nomondi",
    password: hashPassword("nurse123"),
    fullName: "Nurse Joseph Omondi",
    role: "nurse",
    facilityId: facility.id,
    email: "omondi@onehealth.ke",
    phone: "+254700000003",
    isActive: true,
  });

  await storage.createUser({
    username: "labtech",
    password: hashPassword("lab123"),
    fullName: "Grace Muthoni",
    role: "lab_tech",
    facilityId: facility.id,
    email: "muthoni@onehealth.ke",
    phone: "+254700000004",
    isActive: true,
  });

  await storage.createUser({
    username: "reception",
    password: hashPassword("reception123"),
    fullName: "Faith Njeri",
    role: "reception",
    facilityId: facility.id,
    email: "njeri@onehealth.ke",
    phone: "+254700000006",
    isActive: true,
  });

  await storage.createUser({
    username: "Security123",
    password: hashPassword("Security123"),
    fullName: "Systems administrator",
    role: "security",
    facilityId: facility.id,
    email: "security@onehealth.ke",
    phone: "+254700000007",
    isActive: true,
  });

  const patient1 = await storage.createPatient({
    mrn: "MRN-2024-001",
    firstName: "James",
    lastName: "Kipchoge",
    dateOfBirth: "1985-03-15",
    gender: "male",
    nationalId: "12345678",
    phone: "+254711111111",
    email: "james.k@email.com",
    address: "456 Uhuru Street",
    city: "Nairobi",
    country: "KE",
    bloodGroup: "O+",
    allergies: "Penicillin",
    nextOfKinName: "Mary Kipchoge",
    nextOfKinPhone: "+254722222222",
    nextOfKinRelation: "Spouse",
    facilityId: facility.id,
    isActive: true,
  });

  const patient2 = await storage.createPatient({
    mrn: "MRN-2024-002",
    firstName: "Aisha",
    lastName: "Mohamed",
    dateOfBirth: "1992-07-22",
    gender: "female",
    nationalId: "87654321",
    phone: "+254733333333",
    email: "aisha.m@email.com",
    address: "789 Kenyatta Avenue",
    city: "Mombasa",
    country: "KE",
    bloodGroup: "A+",
    allergies: null,
    nextOfKinName: "Hassan Mohamed",
    nextOfKinPhone: "+254744444444",
    nextOfKinRelation: "Brother",
    facilityId: facility.id,
    isActive: true,
  });

  const patient3 = await storage.createPatient({
    mrn: "MRN-2024-003",
    firstName: "David",
    lastName: "Ochieng",
    dateOfBirth: "1978-11-30",
    gender: "male",
    nationalId: "11223344",
    phone: "+254755555555",
    address: "12 Oginga Odinga Rd",
    city: "Kisumu",
    country: "KE",
    bloodGroup: "B-",
    allergies: "Sulfa drugs, Aspirin",
    nextOfKinName: "Rose Ochieng",
    nextOfKinPhone: "+254766666666",
    nextOfKinRelation: "Wife",
    facilityId: facility.id,
    isActive: true,
  });

  const patient4 = await storage.createPatient({
    mrn: "MRN-2024-004",
    firstName: "Lucy",
    lastName: "Wambui",
    dateOfBirth: "2001-04-18",
    gender: "female",
    nationalId: "99887766",
    phone: "+254777777777",
    address: "33 Jomo Kenyatta Blvd",
    city: "Nakuru",
    country: "KE",
    bloodGroup: "AB+",
    nextOfKinName: "John Wambui",
    nextOfKinPhone: "+254788888888",
    nextOfKinRelation: "Father",
    facilityId: facility.id,
    isActive: true,
  });

  const now = new Date();
  const encounter1 = await storage.createEncounter({
    patientId: patient1.id,
    clinicianId: drWanjiku.id,
    facilityId: facility.id,
    type: "outpatient",
    status: "completed",
    chiefComplaint: "Persistent headache for 3 days",
    subjective: "Patient reports severe frontal headache for the past 3 days, worse in the morning. Associated with mild nausea. No visual changes or fever. Has been taking paracetamol with partial relief.",
    objective: "BP 140/88 mmHg, HR 78 bpm, Temp 36.8C. Alert and oriented. No papilledema. Neck supple. Neurological exam normal.",
    assessment: "Tension-type headache. Mild hypertension.",
    plan: "1. Continue paracetamol 1g TDS for 5 days\n2. Start amlodipine 5mg OD\n3. Lifestyle modification counseling\n4. Follow-up in 2 weeks\n5. Blood pressure monitoring",
    icdCodes: "G44.2, I10",
    visitDate: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000),
  });

  const encounter2 = await storage.createEncounter({
    patientId: patient2.id,
    clinicianId: drWanjiku.id,
    facilityId: facility.id,
    type: "outpatient",
    status: "in_progress",
    chiefComplaint: "Lower abdominal pain and frequent urination",
    subjective: "Patient presents with burning sensation during urination for 2 days. Increased frequency. No fever or flank pain. Last menstrual period 2 weeks ago.",
    objective: "Temp 37.1C, BP 118/72 mmHg. Suprapubic tenderness on palpation. No costovertebral angle tenderness.",
    assessment: "Suspected urinary tract infection",
    plan: "1. Urinalysis and urine culture\n2. Start nitrofurantoin 100mg BID for 7 days\n3. Increase fluid intake\n4. Return if symptoms worsen",
    icdCodes: "N39.0",
    visitDate: now,
  });

  await storage.createVitals({
    encounterId: encounter1.id,
    patientId: patient1.id,
    temperature: "36.8",
    bloodPressureSystolic: 140,
    bloodPressureDiastolic: 88,
    heartRate: 78,
    respiratoryRate: 18,
    oxygenSaturation: 98,
    weight: "82.5",
    height: "175",
    recordedBy: nurseOmondi.id,
  });

  await storage.createVitals({
    encounterId: encounter2.id,
    patientId: patient2.id,
    temperature: "37.1",
    bloodPressureSystolic: 118,
    bloodPressureDiastolic: 72,
    heartRate: 82,
    respiratoryRate: 16,
    oxygenSaturation: 99,
    weight: "58.0",
    height: "163",
    recordedBy: nurseOmondi.id,
  });

  const apt1time = new Date();
  apt1time.setHours(9, 0, 0, 0);
  await storage.createAppointment({
    patientId: patient1.id,
    clinicianId: drWanjiku.id,
    facilityId: facility.id,
    scheduledDate: apt1time,
    duration: 30,
    status: "completed",
    reason: "Follow-up for hypertension",
  });

  const apt2time = new Date();
  apt2time.setHours(10, 30, 0, 0);
  await storage.createAppointment({
    patientId: patient2.id,
    clinicianId: drWanjiku.id,
    facilityId: facility.id,
    scheduledDate: apt2time,
    duration: 30,
    status: "in_progress",
    reason: "UTI symptoms evaluation",
  });

  const apt3time = new Date();
  apt3time.setHours(14, 0, 0, 0);
  await storage.createAppointment({
    patientId: patient3.id,
    clinicianId: drWanjiku.id,
    facilityId: facility.id,
    scheduledDate: apt3time,
    duration: 45,
    status: "scheduled",
    reason: "Annual physical examination",
  });

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(11, 0, 0, 0);
  await storage.createAppointment({
    patientId: patient4.id,
    clinicianId: drWanjiku.id,
    facilityId: facility.id,
    scheduledDate: tomorrow,
    duration: 30,
    status: "scheduled",
    reason: "Skin rash consultation",
  });

  await storage.createLabOrder({
    encounterId: encounter2.id,
    patientId: patient2.id,
    orderedBy: drWanjiku.id,
    testName: "Urinalysis",
    testCode: "UA-001",
    status: "ordered",
    priority: "urgent",
  });

  await storage.createLabOrder({
    encounterId: encounter1.id,
    patientId: patient1.id,
    orderedBy: drWanjiku.id,
    testName: "Complete Blood Count",
    testCode: "CBC-001",
    status: "resulted",
    priority: "routine",
    result: "Normal values across all parameters",
    resultValue: "WBC: 7.2, RBC: 4.8, Hgb: 14.2, Hct: 42.1, Plt: 250",
    referenceRange: "WBC: 4-11, RBC: 4.5-5.5, Hgb: 13.5-17.5",
    isCritical: false,
  });

  await storage.createLabOrder({
    patientId: patient3.id,
    orderedBy: drWanjiku.id,
    testName: "Lipid Panel",
    testCode: "LP-001",
    status: "processing",
    priority: "routine",
  });

  await storage.createPrescription({
    encounterId: encounter1.id,
    patientId: patient1.id,
    prescribedBy: drWanjiku.id,
    medicationName: "Amlodipine",
    dosage: "5mg",
    frequency: "Once daily",
    duration: "30 days",
    quantity: 30,
    instructions: "Take in the morning with food",
    status: "dispensed",
  });

  await storage.createPrescription({
    encounterId: encounter1.id,
    patientId: patient1.id,
    prescribedBy: drWanjiku.id,
    medicationName: "Paracetamol",
    dosage: "1g",
    frequency: "Three times daily",
    duration: "5 days",
    quantity: 15,
    instructions: "Take after meals",
    status: "dispensed",
  });

  await storage.createPrescription({
    encounterId: encounter2.id,
    patientId: patient2.id,
    prescribedBy: drWanjiku.id,
    medicationName: "Nitrofurantoin",
    dosage: "100mg",
    frequency: "Twice daily",
    duration: "7 days",
    quantity: 14,
    instructions: "Take with food. Complete the full course.",
    status: "active",
  });

  await storage.createInvoice({
    encounterId: encounter1.id,
    patientId: patient1.id,
    facilityId: facility.id,
    totalAmount: "3500",
    paidAmount: "3500",
    status: "paid",
    items: JSON.stringify([
      { description: "Consultation Fee", amount: 1500 },
      { description: "CBC Test", amount: 800 },
      { description: "Amlodipine 5mg x30", amount: 600 },
      { description: "Paracetamol 1g x15", amount: 600 },
    ]),
    paymentMethod: "mpesa",
  });

  await storage.createInvoice({
    encounterId: encounter2.id,
    patientId: patient2.id,
    facilityId: facility.id,
    totalAmount: "2800",
    paidAmount: "0",
    status: "pending",
    items: JSON.stringify([
      { description: "Consultation Fee", amount: 1500 },
      { description: "Urinalysis", amount: 500 },
      { description: "Nitrofurantoin 100mg x14", amount: 800 },
    ]),
    paymentMethod: null,
  });

  await storage.createAuditLog({
    userId: admin.id,
    action: "SYSTEM_SEED",
    resource: "system",
    details: "Database seeded with initial data",
  });

  console.log("Database seeded successfully");
}
