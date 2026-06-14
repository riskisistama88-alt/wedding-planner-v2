/**
 * ==========================================================================
 * AURA SERVERLESS PRO MULTI-TENANT BACKEND ENGINE
 * Google Apps Script Web App Endpoint (Code.gs)
 * Scenario: Dynamic Isolated Tenant Database
 * ==========================================================================
 */

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
    // Jalankan auto-setup struktur tabel registry utama
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
      case "login":
        response = loginUser(email, payload.passcode || payload.passcode_token);
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
// CORE DATA ENGINE LOGIC (Isolated Tenant routing)
// ==========================================================================

function getTenantContext(projectId) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const registrySheet = ss.getSheetByName("ProjectRegistry");
  const rawRegistry = registrySheet.getDataRange().getValues();
  
  for (let i = 1; i < rawRegistry.length; i++) {
    if (rawRegistry[i][0] === projectId) {
      return {
        spreadsheetId: rawRegistry[i][2],
        folderId: rawRegistry[i][3],
        projectName: rawRegistry[i][1]
      };
    }
  }
  
  // Jika tidak ditemukan, daftarkan & cetak otomatis (dynamic self-healing)
  let defaultName = "Draf Perencanaan";
  if (projectId === "WD-AURA-001") defaultName = "Rachel & Kevin's Wedding";
  if (projectId === "WD-AURA-002") defaultName = "Indah & Tama's Wedding";
  
  return provisionTenantDatabase(projectId, defaultName);
}

function fetchProjectContextData(projectId) {
  const tenant = getTenantContext(projectId);
  const tenantSS = SpreadsheetApp.openById(tenant.spreadsheetId);
  
  // 1. Ambil budget limit dari Sheet_Rekap
  const rekapSheet = tenantSS.getSheetByName("Sheet_Rekap");
  const budgetLimit = parseInt(rekapSheet.getRange("C2").getValue()) || 100000000;
  
  // 2. Ambil data vendor dan payment dari Sheet_Utama
  const utamaSheet = tenantSS.getSheetByName("Sheet_Utama");
  const rawData = utamaSheet.getDataRange().getValues();
  const vendors = [];
  const payments = [];
  
  for (let i = 1; i < rawData.length; i++) {
    const jenis = rawData[i][2]; // JenisData
    const dataJsonStr = rawData[i][4]; // DataJSON
    if (!dataJsonStr) continue;
    
    try {
      const dataObj = JSON.parse(dataJsonStr);
      if (jenis === "Vendor") {
        vendors.push(dataObj);
      } else if (jenis === "Payment") {
        payments.push(dataObj);
      }
    } catch (e) {}
  }
  
  return {
    success: true,
    projectId: projectId,
    projectName: tenant.projectName,
    budgetLimit: budgetLimit,
    vendors: vendors,
    payments: payments
  };
}

function insertVendor(vendor, projectId, email) {
  const tenant = getTenantContext(projectId);
  const tenantSS = SpreadsheetApp.openById(tenant.spreadsheetId);
  
  let finalImageUrl = "";
  if (vendor.brochure_img && vendor.brochure_img.startsWith("data:")) {
    const fileName = "Brosur_" + vendor.category + "_" + vendor.vendor_name.replace(/\s+/g, '_');
    finalImageUrl = uploadBase64ToTenantFolder(vendor.brochure_img, fileName, tenant.folderId);
    vendor.brochure_img = finalImageUrl;
  } else {
    finalImageUrl = vendor.brochure_img || "";
  }

  // Simpan ke Sheet_Utama (JSON storage)
  const utamaSheet = tenantSS.getSheetByName("Sheet_Utama");
  utamaSheet.appendRow([
    new Date(),
    vendor.vendor_id,
    "Vendor",
    vendor.status || "Draft",
    JSON.stringify(vendor),
    finalImageUrl,
    email,
    new Date()
  ]);

  // Simpan ke Sheet_Rekap (flat table)
  const rekapSheet = tenantSS.getSheetByName("Sheet_Rekap");
  rekapSheet.appendRow([
    vendor.vendor_id,
    vendor.category,
    vendor.vendor_name,
    vendor.package_name,
    vendor.price,
    vendor.notes,
    vendor.status || "Draft"
  ]);

  writeTenantLog(tenantSS, projectId, email, "ADD_VENDOR", "Menambahkan alternatif vendor " + vendor.vendor_name + " ke draf.");
  return { success: true, brochure_url: finalImageUrl };
}

function updateVendorStatus(vendorId, status, projectId, email) {
  const tenant = getTenantContext(projectId);
  const tenantSS = SpreadsheetApp.openById(tenant.spreadsheetId);
  
  const utamaSheet = tenantSS.getSheetByName("Sheet_Utama");
  const rawUtama = utamaSheet.getDataRange().getValues();
  
  let targetCategory = "";
  
  // Update di Sheet_Utama
  for (let i = 1; i < rawUtama.length; i++) {
    if (rawUtama[i][1] === vendorId && rawUtama[i][2] === "Vendor") {
      utamaSheet.getRange(i + 1, 4).setValue(status);
      utamaSheet.getRange(i + 1, 8).setValue(new Date());
      
      try {
        const vendorObj = JSON.parse(rawUtama[i][4]);
        vendorObj.status = status;
        utamaSheet.getRange(i + 1, 5).setValue(JSON.stringify(vendorObj));
        targetCategory = vendorObj.category;
      } catch(e){}
      break;
    }
  }

  // Jika statusnya Selected, kembalikan vendor lain di kategori yang sama menjadi Draft
  if (status === "Selected" && targetCategory) {
    for (let i = 1; i < rawUtama.length; i++) {
      if (rawUtama[i][1] !== vendorId && rawUtama[i][2] === "Vendor") {
        try {
          const vObj = JSON.parse(rawUtama[i][4]);
          if (vObj.category === targetCategory && vObj.status === "Selected") {
            vObj.status = "Draft";
            utamaSheet.getRange(i + 1, 4).setValue("Draft");
            utamaSheet.getRange(i + 1, 5).setValue(JSON.stringify(vObj));
          }
        } catch(e){}
      }
    }
  }

  // Sinkronisasikan ulang detail table Sheet_Rekap
  refreshRekapDetailTable(tenantSS);

  writeTenantLog(tenantSS, projectId, email, "UPDATE_VENDOR_STATUS", "Mengubah status vendor " + vendorId + " menjadi " + status);
  return { success: true };
}

function deleteVendor(vendorId, projectId, email) {
  const tenant = getTenantContext(projectId);
  const tenantSS = SpreadsheetApp.openById(tenant.spreadsheetId);
  
  const utamaSheet = tenantSS.getSheetByName("Sheet_Utama");
  const rawUtama = utamaSheet.getDataRange().getValues();

  // Hapus vendor
  for (let i = rawUtama.length - 1; i >= 1; i--) {
    if (rawUtama[i][1] === vendorId && rawUtama[i][2] === "Vendor") {
      utamaSheet.deleteRow(i + 1);
    }
  }

  // Cascade hapus termin pembayaran terkait
  for (let j = rawUtama.length - 1; j >= 1; j--) {
    if (rawUtama[j][2] === "Payment") {
      try {
        const pay = JSON.parse(rawUtama[j][4]);
        if (pay.vendor_id === vendorId) {
          utamaSheet.deleteRow(j + 1);
        }
      } catch(e){}
    }
  }

  // Sinkronisasikan ulang detail table Sheet_Rekap
  refreshRekapDetailTable(tenantSS);

  writeTenantLog(tenantSS, projectId, email, "DELETE_VENDOR", "Menghapus vendor ID: " + vendorId);
  return { success: true };
}

function updateBudgetLimit(limit, projectId, email) {
  const tenant = getTenantContext(projectId);
  const tenantSS = SpreadsheetApp.openById(tenant.spreadsheetId);
  
  const rekapSheet = tenantSS.getSheetByName("Sheet_Rekap");
  rekapSheet.getRange("C2").setValue(limit);
  
  writeTenantLog(tenantSS, projectId, email, "UPDATE_BUDGET_LIMIT", "Merubah total alokasi dana limit proyek menjadi Rp" + limit);
  return { success: true };
}

function savePaymentTerm(term, projectId, email) {
  const tenant = getTenantContext(projectId);
  const tenantSS = SpreadsheetApp.openById(tenant.spreadsheetId);
  
  const utamaSheet = tenantSS.getSheetByName("Sheet_Utama");
  const rawUtama = utamaSheet.getDataRange().getValues();
  let foundRow = -1;

  for (let i = 1; i < rawUtama.length; i++) {
    if (rawUtama[i][1] === term.id && rawUtama[i][2] === "Payment") {
      foundRow = i + 1;
      break;
    }
  }

  if (foundRow !== -1) {
    utamaSheet.getRange(foundRow, 4).setValue(term.status || "Belum Dibayar");
    utamaSheet.getRange(foundRow, 5).setValue(JSON.stringify(term));
    utamaSheet.getRange(foundRow, 8).setValue(new Date());
    writeTenantLog(tenantSS, projectId, email, "UPDATE_PAYMENT_TERM", "Mengedit termin pembayaran " + term.id);
  } else {
    utamaSheet.appendRow([
      new Date(),
      term.id,
      "Payment",
      term.status || "Belum Dibayar",
      JSON.stringify(term),
      term.proof || "",
      email,
      new Date()
    ]);
    writeTenantLog(tenantSS, projectId, email, "ADD_PAYMENT_TERM", "Menjadwalkan rencana termin " + term.stage + " untuk " + term.vendor_name);
  }
  return { success: true };
}

function deletePaymentTerm(paymentId, projectId, email) {
  const tenant = getTenantContext(projectId);
  const tenantSS = SpreadsheetApp.openById(tenant.spreadsheetId);
  
  const utamaSheet = tenantSS.getSheetByName("Sheet_Utama");
  const rawUtama = utamaSheet.getDataRange().getValues();

  for (let i = rawUtama.length - 1; i >= 1; i--) {
    if (rawUtama[i][1] === paymentId && rawUtama[i][2] === "Payment") {
      utamaSheet.deleteRow(i + 1);
      break;
    }
  }
  writeTenantLog(tenantSS, projectId, email, "DELETE_PAYMENT_TERM", "Menghapus jadwal termin pembayaran " + paymentId);
  return { success: true };
}

function updatePaymentStatus(paymentId, status, proofData, proofName, projectId, email) {
  const tenant = getTenantContext(projectId);
  const tenantSS = SpreadsheetApp.openById(tenant.spreadsheetId);
  
  const utamaSheet = tenantSS.getSheetByName("Sheet_Utama");
  const rawUtama = utamaSheet.getDataRange().getValues();

  for (let i = 1; i < rawUtama.length; i++) {
    if (rawUtama[i][1] === paymentId && rawUtama[i][2] === "Payment") {
      utamaSheet.getRange(i + 1, 4).setValue(status);
      utamaSheet.getRange(i + 1, 8).setValue(new Date());
      
      try {
        const pay = JSON.parse(rawUtama[i][4]);
        pay.status = status;
        
        if (proofData && proofData.startsWith("data:")) {
          const safeName = "Resi_" + paymentId + "_" + (proofName || "slip").replace(/\s+/g, '_');
          const driveUrl = uploadBase64ToTenantFolder(proofData, safeName, tenant.folderId);
          pay.proof_data = driveUrl;
          utamaSheet.getRange(i + 1, 6).setValue(driveUrl);
        } else if (status === "Belum Dibayar") {
          pay.proof_data = "";
          utamaSheet.getRange(i + 1, 6).setValue("");
        }
        
        utamaSheet.getRange(i + 1, 5).setValue(JSON.stringify(pay));
      } catch(e){}
      break;
    }
  }
  writeTenantLog(tenantSS, projectId, email, "VERIFY_PAYMENT", "Mengubah status verifikasi bayar " + paymentId + " menjadi " + status);
  return { success: true };
}

// ==========================================================================
// MASTER REGISTRY SUPERADMIN OPERATIONS
// ==========================================================================

function loginUser(email, passcode) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const usersSheet = ss.getSheetByName("MasterUsers");
  const rawUsers = usersSheet.getDataRange().getValues();
  let matchedUserRow = null;
  
  for (let i = 1; i < rawUsers.length; i++) {
    if (rawUsers[i][1].toString().toLowerCase() === email.toLowerCase() && rawUsers[i][3].toString() === passcode) {
      matchedUserRow = {
        projectId: rawUsers[i][0],
        email: rawUsers[i][1],
        role: rawUsers[i][2],
        label: rawUsers[i][2] === "CLIENT_DECIDER" ? "Decider" : "Initiator",
        token: rawUsers[i][3],
        permissions: rawUsers[i][4] ? rawUsers[i][4].split(",") : []
      };
      break;
    }
  }
  
  if (!matchedUserRow) {
    return { success: false, message: "Email atau token PIN salah." };
  }
  
  const tenant = getTenantContext(matchedUserRow.projectId);
  
  // Muat semua user untuk project ini
  const projectUsers = [];
  for (let i = 1; i < rawUsers.length; i++) {
    if (rawUsers[i][0] === matchedUserRow.projectId) {
      projectUsers.push({
        email: rawUsers[i][1],
        role: rawUsers[i][2],
        label: rawUsers[i][2] === "CLIENT_DECIDER" ? "Decider" : "Initiator",
        token: rawUsers[i][3],
        permissions: rawUsers[i][4] ? rawUsers[i][4].split(",") : []
      });
    }
  }
  
  let budget = 100000000;
  try {
    const tenantSS = SpreadsheetApp.openById(tenant.spreadsheetId);
    budget = tenantSS.getSheetByName("Sheet_Rekap").getRange("C2").getValue();
  } catch(e){}
  
  return {
    success: true,
    user: matchedUserRow,
    project: {
      id: matchedUserRow.projectId,
      name: tenant.projectName,
      budget: budget,
      gas_url: "",
      users: projectUsers
    }
  };
}

function saveProjectToSheet(project, email) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const registrySheet = ss.getSheetByName("ProjectRegistry");
  const rawRegistry = registrySheet.getDataRange().getValues();
  let foundRow = -1;

  for (let i = 1; i < rawRegistry.length; i++) {
    if (rawRegistry[i][0] === project.id) { foundRow = i + 1; break; }
  }

  let spreadsheetId = "";
  let folderId = "";

  if (foundRow !== -1) {
    registrySheet.getRange(foundRow, 2).setValue(project.name);
    spreadsheetId = rawRegistry[foundRow - 1][2];
    
    // Update budget limit di file spreadsheet terisolasi
    try {
      const tenantSS = SpreadsheetApp.openById(spreadsheetId);
      tenantSS.getSheetByName("Sheet_Rekap").getRange("C2").setValue(project.budget);
    } catch(e){}
  } else {
    // Dynamic Provisioning database client baru
    const tenant = provisionTenantDatabase(project.id, project.name);
    spreadsheetId = tenant.spreadsheetId;
    folderId = tenant.folderId;
    
    // Update budget limit di file spreadsheet terisolasi
    try {
      const tenantSS = SpreadsheetApp.openById(spreadsheetId);
      tenantSS.getSheetByName("Sheet_Rekap").getRange("C2").setValue(project.budget);
    } catch(e){}
  }

  writeMasterLog(project.id, email, "SAVE_PROJECT", "Mengonfigurasi data utama proyek tenant " + project.name);
  return { success: true };
}

function deleteProjectFromSheet(projectId, email) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  removeRowsByColumnMatch(ss.getSheetByName("ProjectRegistry"), 0, projectId);
  removeRowsByColumnMatch(ss.getSheetByName("MasterUsers"), 0, projectId);
  writeMasterLog(projectId, email, "DELETE_PROJECT", "Menghapus proyek " + projectId + " dari registri.");
  return { success: true };
}

function saveUserRoleToSheet(user, email) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName("MasterUsers");
  const data = sheet.getDataRange().getValues();
  let foundRow = -1;

  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === user.projectId && data[i][1] === user.email) { foundRow = i + 1; break; }
  }

  const perms = user.permissions.join(",");
  if (foundRow !== -1) {
    sheet.getRange(foundRow, 3).setValue(user.role);
    sheet.getRange(foundRow, 4).setValue(user.token);
    sheet.getRange(foundRow, 5).setValue(perms);
  } else {
    sheet.appendRow([user.projectId, user.email, user.role, user.token, perms]);
  }
  writeMasterLog(user.projectId, email, "SAVE_USER_ROLE", "Sinkronisasi otorisasi user " + user.email);
  return { success: true };
}

function deleteUserFromSheet(user, email) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName("MasterUsers");
  const data = sheet.getDataRange().getValues();
  for (let i = data.length - 1; i >= 1; i--) {
    if (data[i][0] === user.projectId && data[i][1] === user.email) { sheet.deleteRow(i + 1); }
  }
  writeMasterLog(user.projectId, email, "DELETE_USER", "Mencabut hak kolaborasi user " + user.email);
  return { success: true };
}

// ==========================================================================
// STORAGE & UTILITIES
// ==========================================================================

function uploadBase64ToTenantFolder(base64Data, fileName, folderId) {
  const parts = base64Data.split(',');
  const mimeType = parts[0].match(/:(.*?);/)[1];
  const decodedBlob = Utilities.newBlob(Utilities.base64Decode(parts[1]), mimeType, fileName);
  
  const folder = DriveApp.getFolderById(folderId);
  const file = folder.createFile(decodedBlob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return file.getUrl();
}

function writeMasterLog(projectId, user, action, details) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let logSheet = ss.getSheetByName("AURA_Logs");
    if (!logSheet) {
      logSheet = ss.insertSheet("AURA_Logs");
      logSheet.appendRow(["Timestamp", "ProjectID", "User", "Action", "Details"]);
      logSheet.getRange("A1:E1").setFontWeight("bold").setBackground("#7a7a7a").setFontColor("#ffffff");
    }
    logSheet.appendRow([new Date(), projectId, user, action, details]);
  } catch(e){}
}

function writeTenantLog(tenantSS, projectId, user, action, details) {
  try {
    tenantSS.getSheetByName("Sheet_Log").appendRow([new Date(), projectId, user, action, details]);
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

function refreshRekapDetailTable(tenantSS) {
  const rekapSheet = tenantSS.getSheetByName("Sheet_Rekap");
  const lastRow = rekapSheet.getLastRow();
  
  if (lastRow >= 7) {
    rekapSheet.deleteRows(7, lastRow - 6);
  }
  
  const utamaSheet = tenantSS.getSheetByName("Sheet_Utama");
  const rawUtama = utamaSheet.getDataRange().getValues();
  
  for (let i = 1; i < rawUtama.length; i++) {
    if (rawUtama[i][2] === "Vendor") {
      try {
        const v = JSON.parse(rawUtama[i][4]);
        rekapSheet.appendRow([
          v.vendor_id,
          v.category,
          v.vendor_name,
          v.package_name,
          v.price,
          v.notes,
          v.status
        ]);
      } catch(e){}
    }
  }
}

// ==========================================================================
// AUTOMATIC DATABASE SCHEMATIC INITIALIZER
// ==========================================================================

function setupDatabase() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  // 1. Setup ProjectRegistry
  if (!ss.getSheetByName("ProjectRegistry")) {
    const sh = ss.insertSheet("ProjectRegistry");
    sh.appendRow(["project_id", "project_name", "spreadsheet_id", "folder_id", "created_at"]);
    sh.getRange("A1:E1").setFontWeight("bold").setBackground("#1d1d1f").setFontColor("#ffffff");
  }

  // 2. Setup MasterUsers
  if (!ss.getSheetByName("MasterUsers")) {
    const sh = ss.insertSheet("MasterUsers");
    sh.appendRow(["project_id", "email", "role", "passcode_token", "permissions"]);
    sh.getRange("A1:E1").setFontWeight("bold").setBackground("#1d1d1f").setFontColor("#ffffff");
    
    // Seed default users
    sh.appendRow(["WD-AURA-001", "rachel.adriana@gmail.com", "CLIENT_DECIDER", "2027", "Vendor,Budget,Milestone,Verify"]);
    sh.appendRow(["WD-AURA-001", "kevin.pradana@gmail.com", "CLIENT_INITIATOR", "2027", "Vendor"]);
    sh.appendRow(["WD-AURA-002", "tama.decider@sg-corp.com", "CLIENT_DECIDER", "270327", "Vendor,Budget,Milestone,Verify"]);
    sh.appendRow(["WD-AURA-002", "indah.adr@gmail.com", "CLIENT_INITIATOR", "270327", "Vendor"]);
  }

  // Hapus sheet bawaan "Sheet1" jika ada
  const defaultSheet = ss.getSheetByName("Sheet1");
  if (defaultSheet) {
    try {
      ss.deleteSheet(defaultSheet);
    } catch(e){}
  }
}

function provisionTenantDatabase(projectId, projectName) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const registrySheet = ss.getSheetByName("ProjectRegistry");
  
  // 1. Buat Spreadsheet Google Sheets Baru
  const newSS = SpreadsheetApp.create("AURA_Database_" + projectId);
  const spreadsheetId = newSS.getId();
  
  // 2. Setup Sheet_Utama
  const shUtama = newSS.getActiveSheet();
  shUtama.setName("Sheet_Utama");
  shUtama.appendRow(["Timestamp", "ID", "JenisData", "Status", "DataJSON", "FileURL", "CreatedBy", "UpdatedAt"]);
  shUtama.getRange("A1:H1").setFontWeight("bold").setBackground("#1d1d1f").setFontColor("#ffffff");
  
  // 3. Setup Sheet_Rekap
  const shRekap = newSS.insertSheet("Sheet_Rekap");
  shRekap.getRange("B1").setValue("AURA MOTHERBOARD BUDGET DASHBOARD").setFontWeight("bold").setFontSize(12);
  shRekap.getRange("B2").setValue("Total Budget Limit:");
  shRekap.getRange("C2").setValue(100000000).setNumberFormat("Rp#,##0");
  shRekap.getRange("B3").setValue("Current Selected Spending:");
  shRekap.getRange("C3").setFormula('=SUMIF(G7:G100, "Selected", E7:E100)').setNumberFormat("Rp#,##0");
  shRekap.getRange("B4").setValue("Remaining Budget:");
  shRekap.getRange("C4").setFormula("=C2-C3").setNumberFormat("Rp#,##0");
  
  shRekap.getRange("B1:C4").setBackground("#f5f5f7");
  shRekap.getRange("B2:B4").setFontWeight("bold");
  shRekap.getRange("C2:C4").setFontWeight("bold").setFontColor("#0066cc");
  
  shRekap.appendRow([]); // Row 5 empty
  shRekap.appendRow(["ID", "Kategori", "Nama Vendor", "Nama Paket", "Harga (Rp)", "Catatan Teknis", "Status"]);
  shRekap.getRange("A6:G6").setFontWeight("bold").setBackground("#1d1d1f").setFontColor("#ffffff");
  
  // 4. Setup Sheet_Log
  const shLog = newSS.insertSheet("Sheet_Log");
  shLog.appendRow(["Timestamp", "ProjectID", "User", "Action", "Details"]);
  shLog.getRange("A1:E1").setFontWeight("bold").setBackground("#7a7a7a").setFontColor("#ffffff");
  
  // 5. Setup Folder Google Drive Baru
  const rootFolders = DriveApp.getFoldersByName(DRIVE_ROOT_FOLDER_NAME);
  const masterFolder = rootFolders.hasNext() ? rootFolders.next() : DriveApp.createFolder(DRIVE_ROOT_FOLDER_NAME);
  
  const tenantFolder = masterFolder.createFolder("Uploads_" + projectId);
  const folderId = tenantFolder.getId();
  
  // Pindahkan spreadsheet baru ke folder master agar rapi
  const file = DriveApp.getFileById(spreadsheetId);
  masterFolder.addFile(file);
  DriveApp.getRootFolder().removeFile(file);
  
  // 6. Simpan Metadata ke Registry
  registrySheet.appendRow([projectId, projectName, spreadsheetId, folderId, new Date()]);
  
  return {
    spreadsheetId: spreadsheetId,
    folderId: folderId,
    projectName: projectName
  };
}
