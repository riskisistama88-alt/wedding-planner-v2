/**
 * ==========================================================================
 * AURA SERVERLESS PRO MULTI-TENANT & DYNAMIC ISOLATED DATABASE ENGINE
 * Web App Production Endpoint (Code.gs)
 * ==========================================================================
 */

const MASTER_REGISTRY = {
  PROJECTS: "AURA_Projects",
  USERS: "AURA_Users",
  LOGS: "AURA_Logs"
};

const DRIVE_ROOT_FOLDER_NAME = "AURA_Wedding_Planner_Uploads";

function doGet(e) {
  return createJsonResponse({
    success: true,
    message: "AURA Multi-Tenant Core Engine aktif dan berjalan normal.",
    timestamp: new Date().toISOString()
  });
}

function doPost(e) {
  try {
    // Jalankan inisialisasi Master Registry Sheet di awal
    setupMasterRegistry();

    const requestBody = JSON.parse(e.postData.contents);
    const action = requestBody.action;
    const payload = requestBody.data || requestBody;
    const email = requestBody.email || "system@aurawedding.com";
    const projectId = requestBody.projectId || payload.projectId || (payload.id && payload.id.startsWith("WD-") ? payload.id : "WD-AURA-001");

    let response = { success: false, message: "Aksi '" + action + "' gagal dieksekusi di server cloud." };

    switch (action) {
      // ====================================================================
      // ROUTE 1: OPERASI SUPERADMIN REGISTER (admin.html & admin.js)
      // ====================================================================
      case "saveProject":
        response = executeDynamicProvisioning(payload, email);
        break;
        
      case "deleteProject":
        response = executeCascadeDeleteTenant(payload.id, email);
        break;
        
      case "saveUserRole":
        response = saveUserRoleToMaster(payload, email);
        break;
        
      case "deleteUserRole":
        response = deleteUserFromMaster(payload, email);
        break;

      // ====================================================================
      // ROUTE 2: TWO-WAY DATA READ SYNC (dashboard.html & rekap.html)
      // ====================================================================
      case "getProjectData":
        response = fetchProjectContextData(projectId);
        break;
      case "login":
        response = loginUser(email, payload.passcode || payload.passcode_token);
        break;
      case "getAdminData":
        response = getAdminMasterData();
        break;

      // ====================================================================
      // ROUTE 3: TRANSAKSI SPREADSHEET TERISOLASI TENANT (Workspace & Kas)
      // ====================================================================
      case "addVendor":
      case "updateVendorStatus":
      case "deleteVendor":
      case "updateBudgetLimit":
      case "savePaymentTerm":
      case "deletePaymentTerm":
      case "updatePaymentStatus":
        response = routeToIsolatedTenantDatabase(action, projectId, payload, email);
        break;
    }

    return createJsonResponse(response);

  } catch (err) {
    return createJsonResponse({ 
      success: false, 
      message: "Gagal cloud sync: Terjadi kegagalan pemrosesan di server Google Apps Script.",
      error: err.toString()
    });
  }
}

function createJsonResponse(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

// ==========================================================================
// CORE PROVISIONING ENGINE (Fungsi Cetak Database Otomatis)
// ==========================================================================

function executeDynamicProvisioning(project, email) {
  const masterSS = SpreadsheetApp.getActiveSpreadsheet();
  const projSheet = masterSS.getSheetByName(MASTER_REGISTRY.PROJECTS);
  const data = projSheet.getDataRange().getValues();
  
  let foundRow = -1;
  let existingSpreadsheetId = "";
  let existingFolderId = "";

  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === project.id) {
      foundRow = i + 1;
      existingSpreadsheetId = data[i][2]; // Kolom SpreadsheetID
      existingFolderId = data[i][3];      // Kolom FolderID
      break;
    }
  }

  // Jika proyek sudah ada, lakukan pembaruan metadata di Registry Pusat
  if (foundRow !== -1) {
    projSheet.getRange(foundRow, 2).setValue(project.name);
    projSheet.getRange(foundRow, 5).setValue(project.due_date);
    
    // Perbarui batas anggaran di Spreadsheet terisolasi milik tenant tersebut
    if (existingSpreadsheetId) {
      try {
        const tenantSS = SpreadsheetApp.openById(existingSpreadsheetId);
        const rekapSheet = tenantSS.getSheetByName("Sheet_Rekap");
        if (rekapSheet) rekapSheet.getRange("C2").setValue(project.budget);
      } catch(e){}
    }
    
    writeMasterLog(project.id, email, "UPDATE_PROJECT", "Memperbarui metadata proyek multi-tenant: " + project.name);
    return { success: true, message: "Metadata proyek berhasil diperbarui." };
  }

  // --- JIKA PROYEK BARU: CETAK INFRASTRUKTUR CLOUD ISOLATED SECARA OTOMATIS ---
  
  // 1. Lahirkan File Google Sheets Terisolasi Baru
  const tenantSS = SpreadsheetApp.create("AURA_DB_" + project.id);
  const tenantSSId = tenantSS.getId();
  
  // Setup Sheet_Utama (NoSQL Document Store)
  const shUtama = tenantSS.insertSheet("Sheet_Utama");
  shUtama.appendRow(['Timestamp', 'ID', 'JenisData', 'Status', 'DataJSON', 'FileURL', 'CreatedBy', 'UpdatedAt']);
  shUtama.getRange("A1:H1").setFontWeight("bold").setBackground("#1d1d1f").setFontColor("#ffffff");
  shUtama.setFrozenRows(1);
  
  // Setup Sheet_Rekap (Human Readable Ledger)
  const shRekap = tenantSS.insertSheet("Sheet_Rekap");
  shRekap.getRange("B1").setValue("AURA MOTHERBOARD BUDGET - " + project.name.toUpperCase()).setFontSize(11).setFontWeight("bold");
  shRekap.getRange("B2").setValue("Total Budget Limit:").setFontWeight("bold");
  shRekap.getRange("C2").setValue(project.budget).setNumberFormat("Rp#,##0");
  shRekap.getRange("B3").setValue("Current Selected Spending:").setFontWeight("bold");
  shRekap.getRange("C3").setFormula('=SUMIF(G7:G100, "Selected", E7:E100)').setNumberFormat("Rp#,##0");
  shRekap.getRange("B4").setValue("Remaining Budget:").setFontWeight("bold");
  shRekap.getRange("C4").setFormula('=C2-C3').setNumberFormat("Rp#,##0");
  
  shRekap.getRange("A6:G6").setValues([["ID", "Kategori", "Nama Vendor", "Nama Paket", "Harga (Rp)", "Catatan Teknis", "Status"]]);
  shRekap.getRange("A6:G6").setFontWeight("bold").setBackground("#f5f5f7").setFontColor("#1d1d1f");
  shRekap.setFrozenRows(6);
  
  // Setup Sheet_Log
  const shLog = tenantSS.insertSheet("Sheet_Log");
  shLog.appendRow(['Tanggal', 'User', 'Aktivitas', 'Detail']);
  shLog.getRange("A1:D1").setFontWeight("bold").setBackground("#7a7a7a").setFontColor("#ffffff");
  shLog.setFrozenRows(1);
  
  // Bersihkan sheet bawaan kosong
  const defSheet = tenantSS.getSheetByName("Sheet1");
  if (defSheet) tenantSS.deleteSheet(defSheet);

  // 2. Lahirkan Folder Penyimpanan Google Drive Terisolasi Baru
  const driveRoot = getOrCreateFolder(DRIVE_ROOT_FOLDER_NAME);
  const projectFolder = driveRoot.createFolder("Uploads_" + project.id);
  const projectFolderId = projectFolder.getId();
  try {
    projectFolder.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  } catch(e) {
    Logger.log("Domain policy restricted public folder sharing: " + e.toString());
  }

  // 3. Tulis Metadata Hasil Provisioning ke Registry Pusat
  projSheet.appendRow([
    project.id,
    project.name,
    tenantSSId,
    projectFolderId,
    project.due_date,
    project.gas_url || "",
    new Date()
  ]);

  writeMasterLog(project.id, email, "PROVISION_TENANT", "Berhasil mencetak database terisolasi baru dan folder Drive untuk " + project.name);
  return { success: true, message: "Infrastruktur cloud tenant berhasil dicetak otomatis!" };
}

// ==========================================================================
// TENANT INTERACTION ROUTER HUB (Jembatan Pengetikan ke File Terpisah)
// ==========================================================================

function routeToIsolatedTenantDatabase(action, projectId, payload, email) {
  const masterSS = SpreadsheetApp.getActiveSpreadsheet();
  const projSheet = masterSS.getSheetByName(MASTER_REGISTRY.PROJECTS);
  const data = projSheet.getDataRange().getValues();
  
  let tenantSpreadsheetId = "";
  let tenantFolderId = "";

  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === projectId) {
      tenantSpreadsheetId = data[i][2];
      tenantFolderId = data[i][3];
      break;
    }
  }

  if (!tenantSpreadsheetId) {
    return { success: false, message: "Error: Berkas database terisolasi untuk proyek ini tidak ditemukan." };
  }

  // Buka Spreadsheet terisolasi milik tenant secara dinamis
  const tenantSS = SpreadsheetApp.openById(tenantSpreadsheetId);
  const shUtama = tenantSS.getSheetByName("Sheet_Utama");
  const shRekap = tenantSS.getSheetByName("Sheet_Rekap");
  const shLog = tenantSS.getSheetByName("Sheet_Log");

  const timestamp = new Date();

  if (action === "addVendor") {
    let finalImageUrl = "";
    if (payload.brochure_img && payload.brochure_img.startsWith("data:")) {
      const fileName = "Brosur_" + payload.category + "_" + payload.vendor_name.replace(/\s+/g, '_');
      finalImageUrl = uploadBase64ToSpecificFolder(payload.brochure_img, fileName, tenantFolderId);
    }

    shUtama.appendRow([timestamp, payload.vendor_id, "VendorCatalog", "Active", JSON.stringify(payload), finalImageUrl, email, timestamp]);
    shRekap.appendRow([payload.vendor_id, payload.category, payload.vendor_name, payload.package_name, payload.price, payload.notes, "Draft"]);
    if (shLog) shLog.appendRow([timestamp, email, "ADD_VENDOR", "Menambahkan vendor draf: " + payload.vendor_name]);
    return { success: true, brochure_url: finalImageUrl };
  }

  if (action === "updateVendorStatus") {
    // Mutasi di Sheet Rekap (Kolom G) dan Sheet Utama
    updateCellInSheet(shRekap, 0, payload.vendor_id, 6, payload.status);
    updateCellInSheet(shUtama, 1, payload.vendor_id, 3, payload.status);
    
    if (payload.status === "Selected") {
      // Rollback vendor lain di kategori yang sama menjadi Draft
      const currentCat = getCategoryByVendorId(shRekap, payload.vendor_id);
      const rekapRows = shRekap.getDataRange().getValues();
      for (let j = 6; j < rekapRows.length; j++) {
        if (rekapRows[j][1] === currentCat && rekapRows[j][0] !== payload.vendor_id && rekapRows[j][6] === "Selected") {
          shRekap.getRange(j + 1, 7).setValue("Draft");
          updateCellInSheet(shUtama, 1, rekapRows[j][0], 3, "Draft");
        }
      }
    }
    if (shLog) shLog.appendRow([timestamp, email, "UPDATE_STATUS", "Merubah komitmen status vendor " + payload.vendor_id + " menjadi " + payload.status]);
    return { success: true };
  }

  if (action === "deleteVendor") {
    removeRowsByColumnValue(shRekap, 0, payload.vendor_id);
    removeRowsByColumnValue(shUtama, 1, payload.vendor_id);
    // Hapus juga payment milestones yang terikat vendor ini
    const shPayments = tenantSS.getSheetByName("Sheet_Payments") || tenantSS;
    removeRowsByColumnValue(shPayments, 2, payload.vendor_id);
    return { success: true };
  }

  if (action === "updateBudgetLimit") {
    shRekap.getRange("C2").setValue(payload.limit);
    if (shLog) shLog.appendRow([timestamp, email, "UPDATE_LIMIT", "Merubah target limit anggaran utama proyek menjadi Rp" + payload.limit]);
    return { success: true };
  }

  if (action === "savePaymentTerm") {
    let shPayments = tenantSS.getSheetByName("Sheet_Payments");
    if (!shPayments) {
      shPayments = tenantSS.insertSheet("Sheet_Payments");
      shPayments.appendRow(["PaymentID", "ProjectID", "VendorID", "VendorName", "Stage", "Amount", "DueDate", "ProofURL", "Status"]);
      shPayments.getRange("A1:I1").setFontWeight("bold").setBackground("#1d1d1f").setFontColor("#ffffff");
    }
    
    const payRows = shPayments.getDataRange().getValues();
    let foundPayRow = -1;
    for (let k = 1; k < payRows.length; k++) {
      if (payRows[k][0] === payload.id) { foundPayRow = k + 1; break; }
    }

    if (foundPayRow !== -1) {
      shPayments.getRange(foundPayRow, 3).setValue(payload.vendor_id);
      shPayments.getRange(foundPayRow, 4).setValue(payload.vendor_name);
      shPayments.getRange(foundPayRow, 5).setValue(payload.stage);
      shPayments.getRange(foundPayRow, 6).setValue(payload.amount);
      shPayments.getRange(foundPayRow, 7).setValue(payload.due_date);
    } else {
      shPayments.appendRow([payload.id, projectId, payload.vendor_id, payload.vendor_name, payload.stage, payload.amount, payload.due_date, payload.proof || "", payload.status || "Belum Dibayar"]);
    }
    return { success: true };
  }

  if (action === "deletePaymentTerm") {
    const shPayments = tenantSS.getSheetByName("Sheet_Payments");
    removeRowsByColumnValue(shPayments, 0, payload.id);
    return { success: true };
  }

  if (action === "updatePaymentStatus") {
    const shPayments = tenantSS.getSheetByName("Sheet_Payments");
    const payRows = shPayments.getDataRange().getValues();
    for (let m = 1; m < payRows.length; m++) {
      if (payRows[m][0] === payload.id) {
        shPayments.getRange(m + 1, 9).setValue(payload.status);
        if (payload.proof_data && payload.proof_data.startsWith("data:")) {
          const safeResiName = "Resi_" + payload.id + "_" + (payload.proof_name || "slip");
          const proofUrl = uploadBase64ToSpecificFolder(payload.proof_data, safeResiName, tenantFolderId);
          shPayments.getRange(m + 1, 8).setValue(proofUrl);
        } else if (payload.status === "Belum Dibayar") {
          shPayments.getRange(m + 1, 8).setValue("");
        }
        break;
      }
    }
    return { success: true };
  }

  return { success: false, message: "Sub-route aksi internal proyek terisolasi tidak valid." };
}

// ==========================================================================
// TWO-WAY DATA COMPILER READ SYNC
// ==========================================================================

function fetchProjectContextData(projectId) {
  const masterSS = SpreadsheetApp.getActiveSpreadsheet();
  const projSheet = masterSS.getSheetByName(MASTER_REGISTRY.PROJECTS);
  const data = projSheet.getDataRange().getValues();
  
  let tenantSpreadsheetId = "";
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === projectId) { tenantSpreadsheetId = data[i][2]; break; }
  }

  if (!tenantSpreadsheetId) {
    return { success: false, message: "Gagal memuat konteks: Berkas database cloud kosong." };
  }

  const tenantSS = SpreadsheetApp.openById(tenantSpreadsheetId);
  
  // Parse Data Vendor dari Sheet_Rekap
  const shRekap = tenantSS.getSheetByName("Sheet_Rekap");
  const rawRekap = shRekap.getDataRange().getValues();
  const vendors = [];
  
  const budgetLimit = parseInt(shRekap.getRange("C2").getValue()) || 100000000;

  for (let j = 6; j < rawRekap.length; j++) {
    if (rawRekap[j][0]) {
      vendors.push({
        vendor_id: rawRekap[j][0],
        category: rawRekap[j][1],
        vendor_name: rawRekap[j][2],
        package_name: rawRekap[j][3],
        price: parseInt(rawRekap[j][4]) || 0,
        notes: rawRekap[j][5],
        status: rawRekap[j][6],
        brochure_img: getBrochureUrlFromUtama(tenantSS, rawRekap[j][0]),
        drive_url: ""
      });
    }
  }

  // Parse Data Pembayaran dari Sheet_Payments jika ada
  const shPayments = tenantSS.getSheetByName("Sheet_Payments");
  const payments = [];
  if (shPayments) {
    const rawPays = shPayments.getDataRange().getValues();
    for (let k = 1; k < rawPays.length; k++) {
      if (rawPays[k][0]) {
        payments.push({
          id: rawPays[k][0],
          vendor_id: rawPays[k][2],
          vendor_name: rawPays[k][3],
          stage: rawPays[k][4],
          amount: parseInt(rawPays[k][5]) || 0,
          due_date: rawPays[k][6] instanceof Date ? rawPays[k][6].toISOString().split('T')[0] : rawPays[k][6].toString(),
          proof: rawPays[k][7],
          status: rawPays[k][8]
        });
      }
    }
  }

  return {
    success: true,
    projectId: projectId,
    budgetLimit: budgetLimit,
    vendors: vendors,
    payments: payments
  };
}

// ==========================================================================
// AUXILIARY SUBSYSTEMS & DATABASE REPAIR UTILITIES
// ==========================================================================

function saveUserRoleToMaster(user, email) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(MASTER_REGISTRY.USERS);
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
  return { success: true };
}

function deleteUserFromMaster(user, email) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(MASTER_REGISTRY.USERS);
  removeRowsByColumnMatchTwoCriteria(sheet, 0, user.projectId, 1, user.email);
  return { success: true };
}

function executeCascadeDeleteTenant(projectId, email) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const projSheet = ss.getSheetByName(MASTER_REGISTRY.PROJECTS);
  const data = projSheet.getDataRange().getValues();
  
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === projectId) {
      const targetSSId = data[i][2];
      const targetFolderId = data[i][3];
      
      // Hapus file Google Sheets terisolasi dan folder Drive dari Cloud
      try { DriveApp.getFileById(targetSSId).setTrashed(true); } catch(e){}
      try { DriveApp.getFolderById(targetFolderId).setTrashed(true); } catch(e){}
      
      projSheet.deleteRow(i + 1);
      break;
    }
  }
  
  removeRowsByColumnValue(ss.getSheetByName(MASTER_REGISTRY.USERS), 0, projectId);
  writeMasterLog(projectId, email, "CASCADE_DELETE", "Menghapus ekosistem database terisolasi proyek " + projectId);
  return { success: true };
}

function uploadBase64ToSpecificFolder(base64Data, fileName, folderId) {
  const parts = base64Data.split(',');
  const mimeType = parts[0].match(/:(.*?);/)[1];
  const blob = Utilities.newBlob(Utilities.base64Decode(parts[1]), mimeType, fileName);
  const folder = DriveApp.getFolderById(folderId);
  const file = folder.createFile(blob);
  try {
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  } catch(e) {
    Logger.log("Domain policy restricted public file sharing: " + e.toString());
  }
  return file.getUrl();
}

function getBrochureUrlFromUtama(tenantSS, vendorId) {
  try {
    const shUtama = tenantSS.getSheetByName("Sheet_Utama");
    const data = shUtama.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      if (data[i][1] === vendorId) return data[i][5]; // Kolom FileURL
    }
  } catch(e){}
  return "";
}

function getCategoryByVendorId(shRekap, vendorId) {
  const rows = shRekap.getDataRange().getValues();
  for (let i = 6; i < rows.length; i++) {
    if (rows[i][0] === vendorId) return rows[i][1];
  }
  return "";
}

function updateCellInSheet(sheet, matchCol, matchVal, targetCol, newVal) {
  if (!sheet) return;
  const data = sheet.getDataRange().getValues();
  for (let i = 0; i < data.length; i++) {
    if (data[i][matchCol] === matchVal) {
      sheet.getRange(i + 1, targetCol + 1).setValue(newVal);
      break;
    }
  }
}

function removeRowsByColumnValue(sheet, colIdx, val) {
  if (!sheet) return;
  const data = sheet.getDataRange().getValues();
  for (let i = data.length - 1; i >= 0; i--) {
    if (data[i][colIdx] === val) sheet.deleteRow(i + 1);
  }
}

function removeRowsByColumnMatchTwoCriteria(sheet, col1, val1, col2, val2) {
  if (!sheet) return;
  const data = sheet.getDataRange().getValues();
  for (let i = data.length - 1; i >= 1; i--) {
    if (data[i][col1] === val1 && data[i][col2] === val2) sheet.deleteRow(i + 1);
  }
}

function loginUser(email, passcode) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const usersSheet = ss.getSheetByName(MASTER_REGISTRY.USERS);
  const rawUsers = usersSheet.getDataRange().getValues();
  let matchedUserRow = null;
  
  for (let i = 1; i < rawUsers.length; i++) {
    if (rawUsers[i][1].toString().toLowerCase() === email.toLowerCase() && rawUsers[i][4].toString() === passcode) {
      matchedUserRow = {
        projectId: rawUsers[i][0],
        email: rawUsers[i][1],
        role: rawUsers[i][2],
        label: rawUsers[i][3],
        token: rawUsers[i][4],
        permissions: rawUsers[i][5] ? rawUsers[i][5].split(",") : []
      };
      break;
    }
  }
  
  if (!matchedUserRow) {
    return { success: false, message: "Email atau token PIN salah." };
  }
  
  // Ambil detail project dari Project Registry
  const projSheet = ss.getSheetByName(MASTER_REGISTRY.PROJECTS);
  const rawProjects = projSheet.getDataRange().getValues();
  let matchedProjectRow = null;
  
  for (let k = 1; k < rawProjects.length; k++) {
    if (rawProjects[k][0] === matchedUserRow.projectId) {
      matchedProjectRow = {
        id: rawProjects[k][0],
        name: rawProjects[k][1],
        spreadsheetId: rawProjects[k][2],
        folderId: rawProjects[k][3],
        due_date: rawProjects[k][4] instanceof Date ? rawProjects[k][4].toISOString().split('T')[0] : rawProjects[k][4].toString(),
        gas_url: rawProjects[k][5] || ""
      };
      break;
    }
  }
  
  if (!matchedProjectRow) {
    return { success: false, message: "Proyek tidak ditemukan untuk user ini." };
  }
  
  // Ambil semua user untuk project ini
  const projectUsers = [];
  for (let i = 1; i < rawUsers.length; i++) {
    if (rawUsers[i][0] === matchedUserRow.projectId) {
      projectUsers.push({
        email: rawUsers[i][1],
        role: rawUsers[i][2],
        label: rawUsers[i][3],
        token: rawUsers[i][4],
        permissions: rawUsers[i][5] ? rawUsers[i][5].split(",") : []
      });
    }
  }
  
  // Ambil budget dari tenant spreadsheet
  let budget = 100000000;
  try {
    const tenantSS = SpreadsheetApp.openById(matchedProjectRow.spreadsheetId);
    budget = parseInt(tenantSS.getSheetByName("Sheet_Rekap").getRange("C2").getValue()) || 100000000;
  } catch(e){}
  
  return {
    success: true,
    user: matchedUserRow,
    project: {
      id: matchedUserRow.projectId,
      name: matchedProjectRow.name,
      budget: budget,
      gas_url: matchedProjectRow.gas_url,
      users: projectUsers
    }
  };
}

function getAdminMasterData() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  
  // 1. Ambil data all projects
  const projSheet = ss.getSheetByName(MASTER_REGISTRY.PROJECTS);
  const rawProjects = projSheet.getDataRange().getValues();
  const projectsMap = {};
  const projectsList = [];
  
  for (let i = 1; i < rawProjects.length; i++) {
    const pId = rawProjects[i][0];
    if (pId === "GLOBAL") continue;
    
    const pObj = {
      id: pId,
      name: rawProjects[i][1],
      spreadsheet_id: rawProjects[i][2],
      folder_id: rawProjects[i][3],
      due_date: formatDateString(rawProjects[i][4]),
      gas_url: rawProjects[i][5] || "",
      users: []
    };
    projectsMap[pId] = pObj;
    projectsList.push(pObj);
  }
  
  // 2. Ambil data all users
  const usersSheet = ss.getSheetByName(MASTER_REGISTRY.USERS);
  const rawUsers = usersSheet.getDataRange().getValues();
  
  for (let j = 1; j < rawUsers.length; j++) {
    const pId = rawUsers[j][0];
    if (pId === "GLOBAL") continue;
    
    const uObj = {
      email: rawUsers[j][1],
      role: rawUsers[j][2],
      label: rawUsers[j][3],
      token: rawUsers[j][4],
      permissions: rawUsers[j][5] ? rawUsers[j][5].split(",") : []
    };
    
    if (projectsMap[pId]) {
      projectsMap[pId].users.push(uObj);
    }
  }
  
  return {
    success: true,
    projects: projectsList
  };
}

function getOrCreateFolder(name) {
  const folders = DriveApp.getFoldersByName(name);
  return folders.hasNext() ? folders.next() : DriveApp.createFolder(name);
}

function writeMasterLog(projId, user, action, details) {
  try {
    SpreadsheetApp.getActiveSpreadsheet().getSheetByName(MASTER_REGISTRY.LOGS)
      .appendRow([new Date(), projId, user, action, details]);
  } catch(e){}
}

function setupMasterRegistry() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss.getSheetByName(MASTER_REGISTRY.PROJECTS)) {
    const sh = ss.insertSheet(MASTER_REGISTRY.PROJECTS);
    sh.appendRow(["ProjectID", "ProjectName", "SpreadsheetID", "FolderID", "H_Day", "GAS_URL", "CreatedAt"]);
    sh.getRange("A1:G1").setFontWeight("bold").setBackground("#1d1d1f").setFontColor("#ffffff");
    sh.setFrozenRows(1);
  }
  if (!ss.getSheetByName(MASTER_REGISTRY.USERS)) {
    const sh = ss.insertSheet(MASTER_REGISTRY.USERS);
    sh.appendRow(["ProjectID", "Email", "Role", "Label", "Token", "Permissions"]);
    sh.getRange("A1:F1").setFontWeight("bold").setBackground("#1d1d1f").setFontColor("#ffffff");
    sh.setFrozenRows(1);
    
    // Seed kredensial superadmin bypass
    sh.appendRow(["GLOBAL", "admin@aura.com", "SUPERADMIN", "Console Admin", "admin123", "Vendor,Budget,Milestone,Verify"]);
  }
  if (!ss.getSheetByName(MASTER_REGISTRY.LOGS)) {
    const sh = ss.insertSheet(MASTER_REGISTRY.LOGS);
    sh.appendRow(["Timestamp", "ProjectID", "User", "Action", "Details"]);
    sh.getRange("A1:E1").setFontWeight("bold").setBackground("#7a7a7a").setFontColor("#ffffff");
    sh.setFrozenRows(1);
  }
}

function formatDateString(val) {
  if (!val) return "";
  if (val instanceof Date) {
    try {
      return val.toISOString().split('T')[0];
    } catch (e) {
      return val.toString();
    }
  }
  return val.toString();
}
