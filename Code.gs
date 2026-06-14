/**
 * ==========================================================================
 * AURA SERVERLESS PRO MULTI-TENANT BACKEND ENGINE
 * Google Apps Script Web App Endpoint (Code.gs)
 * ==========================================================================
 */

const DB_SHEETS = {
  PROJECTS: "AURA_Projects",
  USERS: "AURA_Users",
  VENDORS: "AURA_Vendors",
  PAYMENTS: "AURA_Payments",
  LOGS: "AURA_Logs"
};

const DRIVE_ROOT_FOLDER_NAME = "AURA_Wedding_Planner_Uploads";

function doGet(e) {
  return createJsonResponse({
    success: true,
    message: "AURA Core Engine REST API aktif. Gunakan POST untuk transaksi data.",
    timestamp: new Date().toISOString()
  });
}

function doPost(e) {
  try {
    // Jalankan auto-setup struktur tabel jika belum ada
    setupDatabase();

    const requestBody = JSON.parse(e.postData.contents);
    const action = requestBody.action;
    const payload = requestBody.data || requestBody; // Fleksibilitas parsing data payload
    const email = requestBody.email || "system@aurawedding.com";
    const projectId = requestBody.projectId || payload.projectId || "WD-AURA-001";

    let response = { success: false, message: "Aksi '" + action + "' tidak dikenali oleh sistem." };

    switch (action) {
      // 1. TWO-WAY INITIAL READ SYNC
      case "getProjectData":
        response = fetchProjectContextData(projectId);
        break;

      // 2. WORKSPACE MANAGEMENT ACTIONS
      case "addVendor":
        response = insertVendor(payload, projectId, email);
        break;
      case "updateVendorStatus":
        response = updateVendorStatus(payload.vendor_id, payload.status, projectId, email);
        break;
      case "deleteVendor":
        response = deleteVendor(payload.vendor_id, projectId, email);
        break;
      case "updateBudgetLimit":
        response = updateBudgetLimit(payload.limit, projectId, email);
        break;

      // 3. MILESTONE & PAYMENT ACTIONS
      case "savePaymentTerm":
        response = savePaymentTerm(payload, projectId, email);
        break;
      case "deletePaymentTerm":
        response = deletePaymentTerm(payload.id, projectId, email);
        break;
      case "updatePaymentStatus":
        response = updatePaymentStatus(payload.id, payload.status, payload.proof_data, payload.proof_name, projectId, email);
        break;

      // 4. SUPERADMIN OPERATIONS
      case "saveProject":
        response = saveProjectToSheet(payload, email);
        break;
      case "deleteProject":
        response = deleteProjectFromSheet(payload.id, email);
        break;
      case "saveUserRole":
        response = saveUserRoleToSheet(payload, email);
        break;
      case "deleteUserRole":
        response = deleteUserFromSheet(payload, email);
        break;
    }

    return createJsonResponse(response);

  } catch (err) {
    return createJsonResponse({ 
      success: false, 
      message: "Terjadi kegagalan pemrosesan di server Google Apps Script.",
      error: err.toString()
    });
  }
}

function createJsonResponse(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

// ==========================================================================
// CORE DATA ENGINE LOGIC
// ==========================================================================

function fetchProjectContextData(projectId) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  
  // Ambil Data Vendor Terkait ProjectID
  const vendorsSheet = ss.getSheetByName(DB_SHEETS.VENDORS);
  const rawVendors = vendorsSheet.getDataRange().getValues();
  const vendors = [];
  for (let i = 1; i < rawVendors.length; i++) {
    if (rawVendors[i][1] === projectId) {
      vendors.push({
        vendor_id: rawVendors[i][0],
        category: rawVendors[i][2],
        vendor_name: rawVendors[i][3],
        package_name: rawVendors[i][4],
        price: parseInt(rawVendors[i][5]) || 0,
        notes: rawVendors[i][6],
        status: rawVendors[i][7],
        brochure_img: rawVendors[i][8],
        drive_url: rawVendors[i][9]
      });
    }
  }

  // Ambil Data Pembayaran Terkait ProjectID
  const paymentsSheet = ss.getSheetByName(DB_SHEETS.PAYMENTS);
  const rawPayments = paymentsSheet.getDataRange().getValues();
  const payments = [];
  for (let j = 1; j < rawPayments.length; j++) {
    if (rawPayments[j][1] === projectId) {
      payments.push({
        id: rawPayments[j][0],
        vendor_id: rawPayments[j][2],
        vendor_name: rawPayments[j][3],
        stage: rawPayments[j][4],
        amount: parseInt(rawPayments[j][5]) || 0,
        due_date: formatDateString(rawPayments[j][6]),
        proof: rawPayments[j][7] ? "Ada" : "",
        proof_data: rawPayments[j][7],
        status: rawPayments[j][8]
      });
    }
  }

  // Ambil Batas Anggaran Proyek
  const projectsSheet = ss.getSheetByName(DB_SHEETS.PROJECTS);
  const rawProjects = projectsSheet.getDataRange().getValues();
  let budgetLimit = 100000000;
  let projectName = "Draf Perencanaan";
  for (let k = 1; k < rawProjects.length; k++) {
    if (rawProjects[k][0] === projectId) {
      projectName = rawProjects[k][1];
      budgetLimit = parseInt(rawProjects[k][2]) || 100000000;
      break;
    }
  }

  return {
    success: true,
    projectId: projectId,
    projectName: projectName,
    budgetLimit: budgetLimit,
    vendors: vendors,
    payments: payments
  };
}

function insertVendor(vendor, projectId, email) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(DB_SHEETS.VENDORS);
  
  let finalImageUrl = "";
  if (vendor.brochure_img && vendor.brochure_img.startsWith("data:")) {
    const fileName = "Brosur_" + vendor.category + "_" + vendor.vendor_name.replace(/\s+/g, '_');
    finalImageUrl = uploadBase64ToDrive(vendor.brochure_img, fileName);
  } else {
    finalImageUrl = vendor.brochure_img || "";
  }

  sheet.appendRow([
    vendor.vendor_id,
    projectId,
    vendor.category,
    vendor.vendor_name,
    vendor.package_name,
    vendor.price,
    vendor.notes,
    vendor.status || "Draft",
    finalImageUrl,
    vendor.drive_url || "",
    email,
    new Date()
  ]);

  writeLog(projectId, email, "ADD_VENDOR", "Menambahkan alternatif vendor " + vendor.vendor_name + " ke draf.");
  return { success: true, brochure_url: finalImageUrl };
}

function updateVendorStatus(vendorId, status, projectId, email) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(DB_SHEETS.VENDORS);
  const data = sheet.getDataRange().getValues();

  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === vendorId && data[i][1] === projectId) {
      sheet.getRange(i + 1, 8).setValue(status);
      sheet.getRange(i + 1, 12).setValue(new Date());

      // Jika statusnya terpilih (Selected), kembalikan vendor lain di kategori yang sama menjadi Draft
      if (status === "Selected") {
        const currentCategory = data[i][2];
        for (let j = 1; j < data.length; j++) {
          if (data[j][1] === projectId && data[j][2] === currentCategory && data[j][0] !== vendorId && data[j][7] === "Selected") {
            sheet.getRange(j + 1, 8).setValue("Draft");
          }
        }
      }
      break;
    }
  }

  writeLog(projectId, email, "UPDATE_VENDOR_STATUS", "Mengubah status vendor " + vendorId + " menjadi " + status);
  return { success: true };
}

function deleteVendor(vendorId, projectId, email) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(DB_SHEETS.VENDORS);
  const data = sheet.getDataRange().getValues();

  for (let i = data.length - 1; i >= 1; i--) {
    if (data[i][0] === vendorId && data[i][1] === projectId) {
      sheet.deleteRow(i + 1);
      break;
    }
  }

  // Hapus juga termin pembayaran terkait vendor yang dihapus
  const paymentsSheet = ss.getSheetByName(DB_SHEETS.PAYMENTS);
  const payData = paymentsSheet.getDataRange().getValues();
  for (let j = payData.length - 1; j >= 1; j--) {
    if (payData[j][2] === vendorId && payData[j][1] === projectId) {
      paymentsSheet.deleteRow(j + 1);
    }
  }

  writeLog(projectId, email, "DELETE_VENDOR", "Menghapus vendor ID: " + vendorId);
  return { success: true };
}

function updateBudgetLimit(limit, projectId, email) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(DB_SHEETS.PROJECTS);
  const data = sheet.getDataRange().getValues();

  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === projectId) {
      sheet.getRange(i + 1, 3).setValue(limit);
      break;
    }
  }
  writeLog(projectId, email, "UPDATE_BUDGET_LIMIT", "Merubah total alokasi dana limit proyek menjadi Rp" + limit);
  return { success: true };
}

function savePaymentTerm(term, projectId, email) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(DB_SHEETS.PAYMENTS);
  const data = sheet.getDataRange().getValues();
  let foundRow = -1;

  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === term.id && data[i][1] === projectId) {
      foundRow = i + 1;
      break;
    }
  }

  if (foundRow !== -1) {
    sheet.getRange(foundRow, 3).setValue(term.vendor_id);
    sheet.getRange(foundRow, 4).setValue(term.vendor_name);
    sheet.getRange(foundRow, 5).setValue(term.stage);
    sheet.getRange(foundRow, 6).setValue(term.amount);
    sheet.getRange(foundRow, 7).setValue(term.due_date);
    writeLog(projectId, email, "UPDATE_PAYMENT_TERM", "Mengedit termin pembayaran " + term.id);
  } else {
    sheet.appendRow([term.id, projectId, term.vendor_id, term.vendor_name, term.stage, term.amount, term.due_date, term.proof || "", term.status || "Belum Dibayar"]);
    writeLog(projectId, email, "ADD_PAYMENT_TERM", "Menjadwalkan rencana termin " + term.stage + " untuk " + term.vendor_name);
  }
  return { success: true };
}

function deletePaymentTerm(paymentId, projectId, email) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(DB_SHEETS.PAYMENTS);
  const data = sheet.getDataRange().getValues();

  for (let i = data.length - 1; i >= 1; i--) {
    if (data[i][0] === paymentId && data[i][1] === projectId) {
      sheet.deleteRow(i + 1);
      break;
    }
  }
  writeLog(projectId, email, "DELETE_PAYMENT_TERM", "Menghapus jadwal termin pembayaran " + paymentId);
  return { success: true };
}

function updatePaymentStatus(paymentId, status, proofData, proofName, projectId, email) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(DB_SHEETS.PAYMENTS);
  const data = sheet.getDataRange().getValues();

  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === paymentId && data[i][1] === projectId) {
      sheet.getRange(i + 1, 9).setValue(status);
      
      if (proofData && proofData.startsWith("data:")) {
        const safeName = "Resi_" + paymentId + "_" + (proofName || "slip").replace(/\s+/g, '_');
        const driveUrl = uploadBase64ToDrive(proofData, safeName);
        sheet.getRange(i + 1, 8).setValue(driveUrl);
      } else if (status === "Belum Dibayar") {
        sheet.getRange(i + 1, 8).setValue("");
      }
      break;
    }
  }
  writeLog(projectId, email, "VERIFY_PAYMENT", "Mengubah status verifikasi bayar " + paymentId + " menjadi " + status);
  return { success: true };
}

function saveProjectToSheet(project, email) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(DB_SHEETS.PROJECTS);
  const data = sheet.getDataRange().getValues();
  let foundRow = -1;

  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === project.id) { foundRow = i + 1; break; }
  }

  if (foundRow !== -1) {
    sheet.getRange(foundRow, 2).setValue(project.name);
    sheet.getRange(foundRow, 3).setValue(project.budget);
    sheet.getRange(foundRow, 4).setValue(project.due_date);
    sheet.getRange(foundRow, 5).setValue(project.gas_url);
  } else {
    sheet.appendRow([project.id, project.name, project.budget, project.due_date, project.gas_url, new Date()]);
  }
  writeLog(project.id, email, "SAVE_PROJECT", "Mengonfigurasi data utama proyek tenant " + project.name);
  return { success: true };
}

function deleteProjectFromSheet(projectId, email) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  removeRowsByColumnMatch(ss.getSheetByName(DB_SHEETS.PROJECTS), 0, projectId);
  removeRowsByColumnMatch(ss.getSheetByName(DB_SHEETS.USERS), 0, projectId);
  removeRowsByColumnMatch(ss.getSheetByName(DB_SHEETS.VENDORS), 1, projectId);
  removeRowsByColumnMatch(ss.getSheetByName(DB_SHEETS.PAYMENTS), 1, projectId);
  writeLog(projectId, email, "DELETE_PROJECT", "Menghapus permanen seluruh ekosistem data proyek " + projectId);
  return { success: true };
}

function saveUserRoleToSheet(user, email) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(DB_SHEETS.USERS);
  const data = sheet.getDataRange().getValues();
  let foundRow = -1;

  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === user.projectId && data[i][1] === user.email) { foundRow = i + 1; break; }
  }

  const perms = user.permissions.join(",");
  if (foundRow !== -1) {
    sheet.getRange(foundRow, 3).setValue(user.role);
    sheet.getRange(foundRow, 4).setValue(user.label);
    sheet.getRange(foundRow, 5).setValue(user.token);
    sheet.getRange(foundRow, 6).setValue(perms);
  } else {
    sheet.appendRow([user.projectId, user.email, user.role, user.label, user.token, perms]);
  }
  writeLog(user.projectId, email, "SAVE_USER_ROLE", "Sinkronisasi otorisasi user " + user.email);
  return { success: true };
}

function deleteUserFromSheet(user, email) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(DB_SHEETS.USERS);
  const data = sheet.getDataRange().getValues();
  for (let i = data.length - 1; i >= 1; i--) {
    if (data[i][0] === user.projectId && data[i][1] === user.email) { sheet.deleteRow(i + 1); }
  }
  writeLog(user.projectId, email, "DELETE_USER", "Mencabut hak kolaborasi user " + user.email);
  return { success: true };
}

// ==========================================================================
// STORAGE & UTILITIES
// ==========================================================================

function uploadBase64ToDrive(base64Data, fileName) {
  const parts = base64Data.split(',');
  const mimeType = parts[0].match(/:(.*?);/)[1];
  const decodedBlob = Utilities.newBlob(Utilities.base64Decode(parts[1]), mimeType, fileName);
  
  const rootFolders = DriveApp.getFoldersByName(DRIVE_ROOT_FOLDER_NAME);
  const folder = rootFolders.hasNext() ? rootFolders.next() : DriveApp.createFolder(DRIVE_ROOT_FOLDER_NAME);
  
  const file = folder.createFile(decodedBlob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return file.getUrl();
}

function writeLog(projectId, user, action, details) {
  try {
    SpreadsheetApp.getActiveSpreadsheet().getSheetByName(DB_SHEETS.LOGS)
      .appendRow([new Date(), projectId, user, action, details]);
  } catch(e){}
}

function removeRowsByColumnMatch(sheet, colIdx, val) {
  if (!sheet) return;
  const data = sheet.getDataRange().getValues();
  for (let i = data.length - 1; i >= 1; i--) {
    if (data[i][colIdx] === val) { sheet.deleteRow(i + 1); }
  }
}

function formatDateString(dateVal) {
  if (!dateVal) return "";
  if (dateVal instanceof Date) {
    return dateVal.toISOString().split('T')[0];
  }
  return dateVal.toString().split('T')[0];
}

// ==========================================================================
// AUTOMATIC DATABASE SCHEMATIC INITIALIZER
// ==========================================================================
function setupDatabase() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  if (!ss.getSheetByName(DB_SHEETS.PROJECTS)) {
    const sh = ss.insertSheet(DB_SHEETS.PROJECTS);
    sh.appendRow(["ProjectID", "ProjectName", "BudgetLimit", "H_Day", "GAS_URL", "CreatedAt"]);
    sh.getRange("A1:F1").setFontWeight("bold").setBackground("#1d1d1f").setFontColor("#ffffff");
    sh.appendRow(["WD-AURA-001", "Rachel & Kevin's Wedding", 100000000, "2027-03-20", "", new Date()]);
    sh.appendRow(["WD-AURA-002", "Indah & Tama's Wedding", 350000000, "2027-03-20", "", new Date()]);
  }
  if (!ss.getSheetByName(DB_SHEETS.USERS)) {
    const sh = ss.insertSheet(DB_SHEETS.USERS);
    sh.appendRow(["ProjectID", "Email", "Role", "Label", "Token", "Permissions"]);
    sh.getRange("A1:F1").setFontWeight("bold").setBackground("#1d1d1f").setFontColor("#ffffff");
    sh.appendRow(["WD-AURA-001", "rachel.adriana@gmail.com", "CLIENT_DECIDER", "Decider (Rachel)", "2027", "Vendor,Budget,Milestone,Verify"]);
    sh.appendRow(["WD-AURA-001", "kevin.pradana@gmail.com", "CLIENT_INITIATOR", "Initiator (Kevin)", "2027", "Vendor"]);
    sh.appendRow(["WD-AURA-002", "tama.decider@sg-corp.com", "CLIENT_DECIDER", "Decider (Tama)", "270327", "Vendor,Budget,Milestone,Verify"]);
    sh.appendRow(["WD-AURA-002", "indah.adr@gmail.com", "CLIENT_INITIATOR", "Initiator (Indah)", "270327", "Vendor"]);
  }
  if (!ss.getSheetByName(DB_SHEETS.VENDORS)) {
    const sh = ss.insertSheet(DB_SHEETS.VENDORS);
    sh.appendRow(["VendorID", "ProjectID", "Category", "VendorName", "PackageName", "Price", "Notes", "Status", "BrochureURL", "DriveURL", "CreatedBy", "UpdatedAt"]);
    sh.getRange("A1:L1").setFontWeight("bold").setBackground("#1d1d1f").setFontColor("#ffffff");
  }
  if (!ss.getSheetByName(DB_SHEETS.PAYMENTS)) {
    const sh = ss.insertSheet(DB_SHEETS.PAYMENTS);
    sh.appendRow(["PaymentID", "ProjectID", "VendorID", "VendorName", "Stage", "Amount", "DueDate", "ProofURL", "Status"]);
    sh.getRange("A1:I1").setFontWeight("bold").setBackground("#1d1d1f").setFontColor("#ffffff");
  }
  if (!ss.getSheetByName(DB_SHEETS.LOGS)) {
    const sh = ss.insertSheet(DB_SHEETS.LOGS);
    sh.appendRow(["Timestamp", "ProjectID", "User", "Action", "Details"]);
    sh.getRange("A1:E1").setFontWeight("bold").setBackground("#7a7a7a").setFontColor("#ffffff");
  }
}
