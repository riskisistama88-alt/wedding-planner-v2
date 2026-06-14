/* ==========================================================================
   AURA SESSION GUARD
   ========================================================================== */
const currentUser = localStorage.getItem("AURA_USER");
if (!currentUser) {
  window.location.href = "index.html";
}

function logout() {
  localStorage.removeItem("AURA_USER");
  window.location.href = "index.html";
}

/* ==========================================================================
   REKAP DATA ENGINE
   ========================================================================== */
let database = [];
let payments = [];
let budgetLimit = 100000000;
let gasUrl = "";
let selectedTermId = null; // tracking term in proof modal
let editingTermId = null;  // tracking term in editing modal

// Multi-Tenant Scoping
let activeProjectId = localStorage.getItem("AURA_ACTIVE_PROJECT_ID") || "WD-AURA-001";
let permissions = ["Vendor", "Budget", "Milestone", "Verify"]; // default all

// Seeding Default Payments if none exist in localStorage
const DUMMY_PAYMENTS = [
  {
    id: "PAY-001",
    vendor_id: "VND-VEN-001",
    vendor_name: "Aula Badarusamsi (Ditkuad)",
    stage: "DP 30%",
    amount: 2595000,
    due_date: "2026-08-01",
    proof: "dummy_slip_ditkuad.png",
    status: "Lunas"
  },
  {
    id: "PAY-002",
    vendor_id: "VND-VEN-001",
    vendor_name: "Aula Badarusamsi (Ditkuad)",
    stage: "Pelunasan 70%",
    amount: 6055000,
    due_date: "2027-02-15",
    proof: "",
    status: "Belum Bayar"
  },
  {
    id: "PAY-003",
    vendor_id: "VND-DEC-001",
    vendor_name: "Line Decor",
    stage: "DP 30%",
    amount: 3000000,
    due_date: "2026-09-10",
    proof: "dummy_slip_linedecor.png",
    status: "Menunggu Verifikasi"
  }
];

window.onload = async function() {
  // Inisialisasi Context User
  setupUserSessionContext();

  gasUrl = localStorage.getItem(`AURA_GAS_URL_${activeProjectId}`) || "";
  budgetLimit = parseInt(localStorage.getItem(`AURA_BUDGET_LIMIT_${activeProjectId}`)) || (activeProjectContext() ? activeProjectContext().budget : 100000000);

  // Ambil Data Live dari GAS jika terkoneksi
  if (gasUrl) {
    await fetchLivePaymentsFromSheets();
  } else {
    loadOfflinePayments();
  }

  // Sembunyikan tombol manipulasi jika tidak memiliki izin akses (RBAC Guard)
  applyUserInterfacePermissions();

  updateSyncStatus();
  calculateMetrics();
  renderSelectedVendors();
  renderPayments();
  populateVendorDropdown();
};

function activeProjectContext() {
  let projects = [];
  const localProjects = localStorage.getItem("AURA_PROJECTS");
  if (localProjects) {
    projects = JSON.parse(localProjects);
  }
  return projects.find(p => p.id === activeProjectId);
}

async function fetchLivePaymentsFromSheets() {
  const syncIndicator = document.getElementById("sync-status");
  if (syncIndicator) {
    syncIndicator.innerHTML = `<span class="loader"></span> Menarik data Sheets...`;
    syncIndicator.className = "text-amber-500 flex items-center gap-1.5 text-[11px] font-semibold";
  }

  try {
    const response = await fetch(gasUrl, {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: JSON.stringify({ 
        action: "getProjectData", 
        projectId: activeProjectId,
        email: currentUser 
      })
    });
    
    const result = await response.json();
    if (result.success) {
      database = result.vendors || [];
      payments = result.payments || [];
      budgetLimit = parseInt(result.budgetLimit) || budgetLimit;

      // Update penyimpanan lokal
      localStorage.setItem(`AURA_VENDORS_DB_${activeProjectId}`, JSON.stringify(database));
      localStorage.setItem(`AURA_PAYMENTS_${activeProjectId}`, JSON.stringify(payments));
      localStorage.setItem(`AURA_BUDGET_LIMIT_${activeProjectId}`, budgetLimit);
      showToast("Data tagihan terbaru berhasil dimuat!");
    }
  } catch (err) {
    console.warn("Gagal mengambil tagihan pembayaran dari cloud, menggunakan data offline:", err);
    loadOfflinePayments();
  }
}

function loadOfflinePayments() {
  const localDB = localStorage.getItem(`AURA_VENDORS_DB_${activeProjectId}`);
  database = localDB ? JSON.parse(localDB) : [];

  const localPayments = localStorage.getItem(`AURA_PAYMENTS_${activeProjectId}`);
  if (localPayments) {
    payments = JSON.parse(localPayments);
  } else {
    payments = [...DUMMY_PAYMENTS];
    localStorage.setItem(`AURA_PAYMENTS_${activeProjectId}`, JSON.stringify(payments));
  }
}

function setupUserSessionContext() {
  // 1. Dynamic Admin Navigation Link Injection
  if (currentUser === "admin@aura.com") {
    const navContainer = document.querySelector("nav .flex.items-center.gap-2") || document.querySelector("nav .flex.items-center.gap-3");
    if (navContainer) {
      const exists = document.getElementById("admin-console-link");
      if (!exists) {
        const adminLink = document.createElement("a");
        adminLink.id = "admin-console-link";
        adminLink.href = "admin.html";
        adminLink.className = "text-amber-400 hover:underline flex items-center gap-1 min-h-[44px] px-2 font-semibold";
        adminLink.innerHTML = `<i class="fa-solid fa-user-shield text-xs"></i> <span class="hidden xs:inline">Console Admin</span>`;
        navContainer.insertBefore(adminLink, navContainer.firstChild);
      }
    }
  }

  // 2. Fetch Multi-Tenant Project Context
  const activeProject = activeProjectContext();
  if (activeProject) {
    // Override default wedding title jika tersedia
    const headerTitle = document.querySelector("header h1");
    if (headerTitle) headerTitle.innerText = activeProject.name;
    
    // Fetch active user's permissions
    const activeUserObj = activeProject.users.find(u => u.email === currentUser);
    if (activeUserObj) {
      permissions = activeUserObj.permissions;
    }
  }

  // Superadmin gets all permissions
  if (currentUser === "admin@aura.com") {
    permissions = ["Vendor", "Budget", "Milestone", "Verify"];
  }

  // Set Greeting Name
  const greetingEl = document.getElementById("user-greeting");
  if (greetingEl && currentUser) {
    if (currentUser.toLowerCase().includes("rachel")) {
      greetingEl.innerText = "Rachel";
    } else if (currentUser.toLowerCase().includes("kevin")) {
      greetingEl.innerText = "Kevin";
    } else {
      if (activeProject) {
        const activeUserObj = activeProject.users.find(u => u.email === currentUser);
        if (activeUserObj) {
          greetingEl.innerText = activeUserObj.label.split(' ')[0];
        } else {
          greetingEl.innerText = currentUser.split('@')[0];
        }
      } else {
        greetingEl.innerText = currentUser.split('@')[0];
      }
    }
  }
}

function applyUserInterfacePermissions() {
  // Enforce RBAC on Budget editing
  if (!permissions.includes("Budget")) {
    const editLimitBtn = document.querySelector("button[onclick='editLimit()']");
    if (editLimitBtn) {
      editLimitBtn.classList.add("hidden");
    }
  }

  // Enforce RBAC on Add Term button
  if (!permissions.includes("Milestone")) {
    const addTermBtn = document.querySelector("button[onclick='openAddTermModal()']");
    if (addTermBtn) {
      addTermBtn.classList.add("hidden");
    }
  }
}

function updateSyncStatus() {
  const el = document.getElementById("sync-status");
  if (gasUrl) {
    el.innerHTML = `<span class="h-2 w-2 rounded-full bg-blue-500 inline-block"></span> GAS Connected`;
    el.className = "text-blue-400 flex items-center gap-1.5 text-[11px] font-semibold";
  } else {
    el.innerHTML = `<span class="h-2 w-2 rounded-full bg-emerald-400 inline-block animate-pulse"></span> Mode Simulasi`;
    el.className = "text-green-400 flex items-center gap-1.5 text-[11px] font-semibold";
  }
}

/* ==========================================================================
   METRICS ENGINE
   ========================================================================== */
function calculateMetrics() {
  const selectedVendors = database.filter(v => v.status === "Selected");
  const totalSpent = selectedVendors.reduce((sum, v) => sum + v.price, 0);
  const totalRemaining = budgetLimit - totalSpent;
  
  // Unique selected categories
  const categories = new Set(selectedVendors.map(v => v.category));
  const completionCount = categories.size;

  // Update Summary Indicators
  document.getElementById("limit-card-value").innerText = formatIDR(budgetLimit);
  document.getElementById("spent-card-value").innerText = formatIDR(totalSpent);
  document.getElementById("remaining-card-value").innerText = formatIDR(totalRemaining);
  document.getElementById("completion-card-value").innerText = `${completionCount} / 6 Kategori`;

  // Color-code Remaining Budget
  const remCardContainer = document.getElementById("remaining-card-container");
  const remCardVal = document.getElementById("remaining-card-value");
  if (totalRemaining < 0) {
    remCardContainer.className = "bg-red-50 p-5 rounded-2xl border border-red-200";
    remCardVal.className = "text-xl font-bold text-red-600 animate-pulse";
  } else {
    remCardContainer.className = "bg-white p-5 rounded-2xl border border-apple-hairline shadow-sm";
    remCardVal.className = "text-xl font-bold text-emerald-600";
  }

  // Calculate Payment stats
  const totalPaid = payments
    .filter(p => p.status === "Lunas")
    .reduce((sum, p) => sum + p.amount, 0);
  
  const remainingDebt = Math.max(0, totalSpent - totalPaid);

  document.getElementById("total-paid-indicator").innerText = formatIDR(totalPaid);
  document.getElementById("remaining-debt-indicator").innerText = formatIDR(remainingDebt);
}

/* ==========================================================================
   RENDERERS
   ========================================================================== */
function renderSelectedVendors() {
  const tbody = document.getElementById("selected-vendors-tbody");
  const emptyRow = document.getElementById("selected-vendors-empty");
  
  // Clear non-empty rows
  const rows = tbody.querySelectorAll("tr:not(#selected-vendors-empty)");
  rows.forEach(r => r.remove());

  const selected = database.filter(v => v.status === "Selected");

  if (selected.length === 0) {
    emptyRow.classList.remove("hidden");
    return;
  }

  emptyRow.classList.add("hidden");

  selected.forEach(v => {
    const tr = document.createElement("tr");
    tr.className = "hover:bg-apple-parchment/30 transition-colors";
    tr.innerHTML = `
      <td class="py-3 px-5 font-semibold text-apple-primary">${v.category}</td>
      <td class="py-3 px-5 font-bold">${v.vendor_name}</td>
      <td class="py-3 px-5 text-apple-muted80">${v.package_name}</td>
      <td class="py-3 px-5 font-bold">${formatIDR(v.price)}</td>
      <td class="py-3 px-5 text-apple-muted48 leading-relaxed">${v.notes}</td>
    `;
    tbody.appendChild(tr);
  });
}

function renderPayments() {
  const tbody = document.getElementById("payments-tbody");
  const emptyRow = document.getElementById("payments-empty");

  // Clear non-empty rows
  const rows = tbody.querySelectorAll("tr:not(#payments-empty)");
  rows.forEach(r => r.remove());

  // Filter out payment schedules belonging to currently selected vendors
  const selectedVendorIds = new Set(database.filter(v => v.status === "Selected").map(v => v.vendor_id));
  const activePayments = payments.filter(p => selectedVendorIds.has(p.vendor_id));

  if (activePayments.length === 0) {
    emptyRow.classList.remove("hidden");
    return;
  }

  emptyRow.classList.add("hidden");

  activePayments.forEach(p => {
    let statusClass = "";
    let statusLabel = "";

    if (p.status === "Lunas") {
      statusClass = "bg-emerald-100 text-emerald-800 border-0 rounded-full px-2.5 py-0.5 font-semibold";
      statusLabel = "Lunas";
    } else if (p.status === "Menunggu Verifikasi") {
      statusClass = "bg-amber-100 text-amber-800 border-0 rounded-full px-2.5 py-0.5 font-semibold animate-pulse";
      statusLabel = "Menunggu Verifikasi";
    } else {
      statusClass = "bg-gray-100 text-gray-800 border-0 rounded-full px-2.5 py-0.5 font-semibold";
      statusLabel = "Belum Dibayar";
    }

    let proofCol = "";
    if (p.proof) {
      proofCol = `
        <button onclick="openProofModal('${p.id}')" class="border border-emerald-300 bg-emerald-50 text-emerald-700 font-semibold rounded-lg px-3 py-1 flex items-center justify-center gap-1.5 hover:bg-emerald-100 transition-all text-[11px]">
          <i class="fa-solid fa-circle-check text-[10px]"></i> Lihat Bukti
        </button>
      `;
    } else {
      proofCol = `
        <button onclick="triggerFileUpload('${p.id}')" class="border border-apple-hairline text-apple-primary hover:bg-apple-parchment font-semibold rounded-lg px-3 py-1 flex items-center justify-center gap-1.5 transition-all text-[11px]">
          <i class="fa-solid fa-cloud-arrow-up text-[10px]"></i> Upload
        </button>
      `;
    }

    let actionsHtml = "";
    
    // 1. Verification Action (if user has Verify permission)
    if (permissions.includes("Verify")) {
      if (p.status === "Menunggu Verifikasi") {
        actionsHtml += `
          <button onclick="toggleVerifyDirect('${p.id}')" class="bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-semibold text-[10px] px-2.5 py-1 rounded-lg border border-emerald-300 transition-all flex items-center gap-1 shadow-sm mr-2" title="Verifikasi Lunas">
            <i class="fa-solid fa-check text-[9px]"></i> Verifikasi
          </button>
        `;
      } else if (p.status === "Lunas") {
        actionsHtml += `
          <button onclick="toggleVerifyDirect('${p.id}')" class="bg-gray-100 hover:bg-red-50 hover:text-red-700 hover:border-red-200 text-gray-500 font-semibold text-[10px] px-2.5 py-1 rounded-lg border border-gray-300 transition-all flex items-center gap-1 mr-2" title="Batalkan Verifikasi">
            <i class="fa-solid fa-circle-check text-emerald-600 text-[10px]"></i> Terverifikasi
          </button>
        `;
      } else {
        actionsHtml += `
          <span class="text-apple-muted48 text-[10px] font-medium italic mr-3" title="Menunggu upload bukti transfer">Belum Bayar</span>
        `;
      }
    } else {
      actionsHtml += `<span class="text-gray-300 font-semibold mr-1">-</span>`;
    }

    // 2. Milestone CRUD actions (if user has Milestone permission)
    if (permissions.includes("Milestone")) {
      actionsHtml += `
        <button onclick="editPaymentTerm('${p.id}')" class="text-gray-400 hover:text-apple-ink p-1 transition-colors mr-1" title="Edit Termin">
          <i class="fa-solid fa-pencil text-xs"></i>
        </button>
        <button onclick="deletePaymentTermFromTable('${p.id}')" class="text-gray-400 hover:text-red-500 p-1 transition-colors" title="Hapus Termin">
          <i class="fa-regular fa-trash-can text-xs"></i>
        </button>
      `;
    }

    const tr = document.createElement("tr");
    tr.className = "hover:bg-apple-parchment/30 transition-colors";
    tr.innerHTML = `
      <td class="py-3.5 px-5 font-bold text-apple-ink">${p.vendor_name}</td>
      <td class="py-3.5 px-5 font-semibold text-apple-muted80">${p.stage}</td>
      <td class="py-3.5 px-5 font-bold text-apple-ink">${formatIDR(p.amount)}</td>
      <td class="py-3.5 px-5 text-apple-muted48">${p.due_date}</td>
      <td class="py-3.5 px-5">${proofCol}</td>
      <td class="py-3.5 px-5">
        <span class="text-[10px] uppercase tracking-wider ${statusClass}">
          ${statusLabel}
        </span>
      </td>
      <td class="py-3.5 px-5 no-print">
        <div class="flex items-center gap-2">
          ${actionsHtml}
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function triggerFileUpload(termId) {
  const fileInput = document.createElement("input");
  fileInput.type = "file";
  fileInput.accept = "image/*";
  fileInput.onchange = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(event) {
      const base64String = event.target.result;
      
      const idx = payments.findIndex(p => p.id === termId);
      if (idx !== -1) {
        payments[idx].proof = file.name;
        payments[idx].proof_data = base64String;
        payments[idx].status = "Menunggu Verifikasi";
        
        localStorage.setItem(`AURA_PAYMENTS_${activeProjectId}`, JSON.stringify(payments));
        calculateMetrics();
        renderPayments();
        showToast("Bukti pembayaran berhasil diunggah!");
      }
    };
    reader.readAsDataURL(file);
  };
  fileInput.click();
}

function handleModalFileUpload(e) {
  if (!selectedTermId) return;

  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function(event) {
    const base64String = event.target.result;
    
    const idx = payments.findIndex(p => p.id === selectedTermId);
    if (idx !== -1) {
      payments[idx].proof = file.name;
      payments[idx].proof_data = base64String;
      payments[idx].status = "Menunggu Verifikasi";
      
      localStorage.setItem(`AURA_PAYMENTS_${activeProjectId}`, JSON.stringify(payments));
      calculateMetrics();
      renderPayments();
      showToast("Bukti pembayaran diunggah!");
      
      // Rerender modal view
      openProofModal(selectedTermId);
    }
  };
  reader.readAsDataURL(file);
}

function populateVendorDropdown() {
  const select = document.getElementById("form-vendor-select");
  select.innerHTML = "";

  const selected = database.filter(v => v.status === "Selected");
  
  if (selected.length === 0) {
    select.innerHTML = `<option value="">-- Tidak ada vendor terpilih --</option>`;
    return;
  }

  selected.forEach(v => {
    const opt = document.createElement("option");
    opt.value = v.vendor_id;
    opt.innerText = `${v.vendor_name} (${v.category} - ${formatIDR(v.price)})`;
    select.appendChild(opt);
  });

  // Calculate automatically for first selected vendor
  suggestAmount();
}

/* ==========================================================================
   TERMIN UTILITIES & MATH SUGGESTIONS
   ========================================================================== */
function toggleCustomStageInput() {
  const stageSelect = document.getElementById("form-term-stage");
  const customPercentInput = document.getElementById("form-term-custom-percent");
  
  if (stageSelect.value === "Custom") {
    customPercentInput.classList.remove("hidden");
    customPercentInput.required = true;
  } else {
    customPercentInput.classList.add("hidden");
    customPercentInput.required = false;
  }

  suggestAmount();
}

function suggestAmount() {
  const vendorId = document.getElementById("form-vendor-select").value;
  if (!vendorId) return;

  const vendor = database.find(v => v.vendor_id === vendorId);
  if (!vendor) return;

  const stage = document.getElementById("form-term-stage").value;
  const amountInput = document.getElementById("form-term-amount");

  if (stage === "DP 30%") {
    amountInput.value = Math.round(vendor.price * 0.3);
  } else if (stage === "Pelunasan 70%") {
    amountInput.value = Math.round(vendor.price * 0.7);
  } else {
    // Custom stage: reads custom percent input and calculates relative to vendor price
    const customPercentEl = document.getElementById("form-term-custom-percent");
    const percent = parseFloat(customPercentEl.value) || 0;
    amountInput.value = Math.round(vendor.price * (percent / 100));
  }
}

/* ==========================================================================
   ACTIONS & MODAL CONTROLS
   ========================================================================== */
function openAddTermModal() {
  editingTermId = null; // reset edit state
  document.getElementById("add-term-form").reset();
  
  // Reset modal submit button label
  const submitBtn = document.querySelector("#add-term-form button[type='submit']");
  if (submitBtn) submitBtn.innerText = "Simpan Termin";
  
  populateVendorDropdown();
  
  // Bind onchange dynamically
  const vendorSelect = document.getElementById("form-vendor-select");
  vendorSelect.onchange = suggestAmount;

  document.getElementById("add-term-modal").classList.remove("hidden");
}

function closeAddTermModal() {
  document.getElementById("add-term-modal").classList.add("hidden");
  document.getElementById("add-term-form").reset();
  document.getElementById("form-term-custom-percent").classList.add("hidden");
  editingTermId = null;
}

function submitNewTerm(e) {
  e.preventDefault();
  
  const vendorId = document.getElementById("form-vendor-select").value;
  if (!vendorId) return;

  const vendor = database.find(v => v.vendor_id === vendorId);
  if (!vendor) return;

  let stageLabel = document.getElementById("form-term-stage").value;
  if (stageLabel === "Custom") {
    const customPercentEl = document.getElementById("form-term-custom-percent");
    const percent = customPercentEl.value || "20";
    stageLabel = `Termin Kustom (${percent}%)`;
  }

  // Duplicate check for stage label
  const isDuplicate = payments.some(p => {
    if (editingTermId && p.id === editingTermId) return false;
    return p.vendor_id === vendorId && p.stage === stageLabel;
  });

  if (isDuplicate) {
    alert(`Termin "${stageLabel}" untuk vendor ${vendor.vendor_name} sudah dijadwalkan sebelumnya!`);
    return;
  }

  const amount = parseInt(document.getElementById("form-term-amount").value) || 0;
  const dueDate = document.getElementById("form-term-due").value;

  if (editingTermId) {
    // UPDATE EXISTED RECORD
    const idx = payments.findIndex(p => p.id === editingTermId);
    if (idx !== -1) {
      payments[idx].vendor_id = vendorId;
      payments[idx].vendor_name = vendor.vendor_name;
      payments[idx].stage = stageLabel;
      payments[idx].amount = amount;
      payments[idx].due_date = dueDate;
      
      showToast("Termin pembayaran berhasil diperbarui!");
    }
  } else {
    // CREATE NEW RECORD
    const newTerm = {
      id: `PAY-${Date.now().toString().slice(-4)}`,
      vendor_id: vendorId,
      vendor_name: vendor.vendor_name,
      stage: stageLabel,
      amount: amount,
      due_date: dueDate,
      proof: "",
      status: "Belum Dibayar"
    };
    payments.push(newTerm);
    
    // Auto-generate remaining term if it's a DP/initial payment
    const stageSelectVal = document.getElementById("form-term-stage").value;
    let autoCreatePelunasan = false;
    let pelunasanPercent = 0;
    let pelunasanLabel = "";

    if (stageSelectVal === "DP 30%") {
      autoCreatePelunasan = true;
      pelunasanPercent = 70;
      pelunasanLabel = "Pelunasan 70%";
    } else if (stageSelectVal === "Custom") {
      const customPercentEl = document.getElementById("form-term-custom-percent");
      const percent = parseFloat(customPercentEl.value) || 0;
      if (percent > 0 && percent < 100) {
        autoCreatePelunasan = true;
        pelunasanPercent = 100 - percent;
        pelunasanLabel = `Pelunasan ${pelunasanPercent}%`;
      }
    }

    if (autoCreatePelunasan) {
      // Get active project to read wedding date
      let projects = [];
      const localProjects = localStorage.getItem("AURA_PROJECTS");
      if (localProjects) {
        projects = JSON.parse(localProjects);
      }
      const activeProject = projects.find(proj => proj.id === activeProjectId);
      
      // Default due date: if project has due_date, use it. Otherwise, 30 days after DP due date
      let pelunasanDueDate = activeProject ? activeProject.due_date : "";
      if (!pelunasanDueDate) {
        const dpDate = new Date(dueDate);
        if (!isNaN(dpDate.getTime())) {
          dpDate.setDate(dpDate.getDate() + 30);
          pelunasanDueDate = dpDate.toISOString().split('T')[0];
        } else {
          pelunasanDueDate = new Date().toISOString().split('T')[0];
        }
      }

      // Calculate amount: vendor price minus DP amount
      const pelunasanAmount = Math.max(0, vendor.price - amount);

      const pelunasanTerm = {
        id: `PAY-${(Date.now() + 1).toString().slice(-4)}`,
        vendor_id: vendorId,
        vendor_name: vendor.vendor_name,
        stage: pelunasanLabel,
        amount: pelunasanAmount,
        due_date: pelunasanDueDate,
        proof: "",
        status: "Belum Dibayar"
      };

      // Check if a payment for this vendor with the same pelunasan label already exists to prevent duplicate auto-generations
      const exists = payments.some(p => p.vendor_id === vendorId && p.stage === pelunasanLabel);
      if (!exists) {
        payments.push(pelunasanTerm);
        showToast("Termin DP dan otomatis sisa pelunasan disimpan!");
      } else {
        showToast("Jadwal termin DP disimpan!");
      }
    } else {
      showToast("Jadwal termin pembayaran disimpan!");
    }
  }

  localStorage.setItem(`AURA_PAYMENTS_${activeProjectId}`, JSON.stringify(payments));
  
  calculateMetrics();
  renderPayments();
  closeAddTermModal();
}

function openProofModal(termId) {
  const p = payments.find(item => item.id === termId);
  if (!p) return;

  selectedTermId = termId;

  // Title & Headers
  document.getElementById("proof-modal-title").innerText = `Kelola: ${p.stage}`;
  document.getElementById("proof-vendor-term").innerText = `${p.vendor_name} — ${p.stage}`;
  document.getElementById("proof-amount-view").innerText = formatIDR(p.amount);

  // Setup simulated slip data
  document.getElementById("receipt-vendor").innerText = p.vendor_name;
  document.getElementById("receipt-amount").innerText = formatIDR(p.amount);
  document.getElementById("receipt-status").innerText = p.status;
  document.getElementById("receipt-sender").innerText = currentUser.split('@')[0].toUpperCase();

  const imageView = document.getElementById("proof-image-view");
  const fallbackReceipt = document.getElementById("proof-fallback-receipt");
  const verifyBtn = document.getElementById("btn-verify-payment");

  // Render proof content depending on file type (real uploaded base64 image or fallback mock)
  if (p.proof) {
    if (p.proof_data) {
      // Real uploaded image
      imageView.src = p.proof_data;
      imageView.classList.remove("hidden");
      fallbackReceipt.classList.add("hidden");
    } else {
      // Dummy seeded slip (simulated)
      imageView.classList.add("hidden");
      fallbackReceipt.classList.remove("hidden");
    }
  } else {
    imageView.classList.add("hidden");
    fallbackReceipt.classList.add("hidden");
  }

  // Verification button styling & RBAC check
  if (!permissions.includes("Verify")) {
    verifyBtn.classList.add("hidden");
  } else {
    verifyBtn.classList.remove("hidden");
    if (p.status === "Lunas") {
      verifyBtn.innerText = "Tandai Belum Bayar";
      verifyBtn.className = "w-2/3 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-full py-2.5 text-xs transition-all transform active:scale-95 min-h-[44px]";
    } else {
      verifyBtn.innerText = "Verifikasi Lunas";
      verifyBtn.className = "w-2/3 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-full py-2.5 text-xs transition-all transform active:scale-95 min-h-[44px]";
    }
  }

  // RBAC check on delete term button in proof modal
  const deleteBtn = document.querySelector("#proof-modal button[onclick='deletePaymentTerm()']");
  if (deleteBtn) {
    if (!permissions.includes("Milestone")) {
      deleteBtn.classList.add("hidden");
      if (permissions.includes("Verify")) {
        verifyBtn.className = verifyBtn.className.replace("w-2/3", "w-full");
      }
    } else {
      deleteBtn.classList.remove("hidden");
    }
  }

  document.getElementById("proof-modal").classList.remove("hidden");
}

function closeProofModal() {
  document.getElementById("proof-modal").classList.add("hidden");
  selectedTermId = null;
  document.getElementById("modal-file-input").value = "";
}

function verifyPaymentStatus() {
  if (!selectedTermId) return;

  const idx = payments.findIndex(p => p.id === selectedTermId);
  if (idx === -1) return;

  const currentStatus = payments[idx].status;

  if (currentStatus === "Lunas") {
    payments[idx].status = "Belum Dibayar";
    payments[idx].proof = "";
    payments[idx].proof_data = "";
    showToast("Status diubah ke Belum Bayar.");
  } else {
    payments[idx].status = "Lunas";
    if (!payments[idx].proof) {
      payments[idx].proof = "verifikasi_manual.png";
    }
    showToast("Status termin diverifikasi Lunas!");
  }

  localStorage.setItem(`AURA_PAYMENTS_${activeProjectId}`, JSON.stringify(payments));
  calculateMetrics();
  renderPayments();
  closeProofModal();
}

function toggleVerifyDirect(termId) {
  const idx = payments.findIndex(p => p.id === termId);
  if (idx === -1) return;

  const currentStatus = payments[idx].status;

  if (currentStatus === "Lunas") {
    payments[idx].status = "Belum Dibayar";
    payments[idx].proof = "";
    payments[idx].proof_data = "";
    showToast("Status diubah ke Belum Bayar.");
  } else {
    payments[idx].status = "Lunas";
    if (!payments[idx].proof) {
      payments[idx].proof = "verifikasi_manual.png";
    }
    showToast("Status termin diverifikasi Lunas!");
  }

  localStorage.setItem(`AURA_PAYMENTS_${activeProjectId}`, JSON.stringify(payments));
  calculateMetrics();
  renderPayments();
}

function deletePaymentTerm() {
  if (!selectedTermId) return;

  showConfirm(
    "Hapus Termin",
    "Apakah Anda yakin ingin menghapus jadwal termin pembayaran ini?",
    () => {
      payments = payments.filter(p => p.id !== selectedTermId);
      localStorage.setItem(`AURA_PAYMENTS_${activeProjectId}`, JSON.stringify(payments));
      
      calculateMetrics();
      renderPayments();
      closeProofModal();
      showToast("Termin pembayaran dihapus.");
    }
  );
}

function deletePaymentTermFromTable(termId) {
  showConfirm(
    "Hapus Termin",
    "Apakah Anda yakin ingin menghapus jadwal termin pembayaran ini?",
    () => {
      payments = payments.filter(p => p.id !== termId);
      localStorage.setItem(`AURA_PAYMENTS_${activeProjectId}`, JSON.stringify(payments));
      
      calculateMetrics();
      renderPayments();
      showToast("Termin pembayaran dihapus.");
    }
  );
}

function editPaymentTerm(termId) {
  const p = payments.find(item => item.id === termId);
  if (!p) return;

  editingTermId = termId;
  
  // Open add modal
  populateVendorDropdown();
  
  document.getElementById("form-vendor-select").value = p.vendor_id;
  
  // Set stage
  const stageSelect = document.getElementById("form-term-stage");
  const customPercentInput = document.getElementById("form-term-custom-percent");
  
  if (p.stage.startsWith("Termin Kustom")) {
    stageSelect.value = "Custom";
    customPercentInput.classList.remove("hidden");
    
    // Extract percentage number (e.g. "Termin Kustom (25%)" -> "25")
    const match = p.stage.match(/\((\d+)%\)/);
    customPercentInput.value = match ? match[1] : "20";
  } else {
    stageSelect.value = p.stage;
    customPercentInput.classList.add("hidden");
  }

  document.getElementById("form-term-amount").value = p.amount;
  document.getElementById("form-term-due").value = p.due_date;
  
  // Set button text to Update
  const submitBtn = document.querySelector("#add-term-form button[type='submit']");
  if (submitBtn) submitBtn.innerText = "Perbarui Termin";

  document.getElementById("add-term-modal").classList.remove("hidden");
}

function editLimit() {
  showConfirm(
    "Ubah Anggaran Maksimal",
    `Batas maksimal saat ini: ${formatIDR(budgetLimit)}. Apakah Anda ingin mengubahnya?`,
    () => {
      const val = prompt("Masukkan Limit Anggaran Pernikahan baru (IDR):", budgetLimit);
      if (val !== null) {
        const num = parseInt(val) || 100000000;
        budgetLimit = num;
        localStorage.setItem(`AURA_BUDGET_LIMIT_${activeProjectId}`, budgetLimit);
        calculateMetrics();
        showToast("Limit Anggaran berhasil diperbarui!");
      }
    }
  );
}

function printReport() {
  window.print();
}

/* ==========================================================================
   MODALS & GENERAL DIALOGS
   ========================================================================== */
function openConfigModal() {
  document.getElementById("config-modal").classList.remove("hidden");
  document.getElementById("config-gas-url").value = localStorage.getItem(`AURA_GAS_URL_${activeProjectId}`) || "";
  document.getElementById("config-gemini-key").value = localStorage.getItem("AURA_GEMINI_KEY") || "";
}

function closeConfigModal() {
  document.getElementById("config-modal").classList.add("hidden");
}

function saveConfiguration() {
  const gas = document.getElementById("config-gas-url").value.trim();
  const gemini = document.getElementById("config-gemini-key").value.trim();

  localStorage.setItem(`AURA_GAS_URL_${activeProjectId}`, gas);
  localStorage.setItem("AURA_GEMINI_KEY", gemini);

  updateSyncStatus();
  closeConfigModal();
  showToast("Konfigurasi database disimpan!");
}

function showToast(msg) {
  const t = document.getElementById("custom-toast");
  t.innerText = msg;
  t.style.opacity = "1";
  t.style.pointerEvents = "auto";
  
  setTimeout(() => {
    t.style.opacity = "0";
    t.style.pointerEvents = "none";
  }, 3000);
}

function showConfirm(title, message, onOk) {
  const modal = document.getElementById("custom-confirm-modal");
  document.getElementById("confirm-title").innerText = title;
  document.getElementById("confirm-msg").innerText = message;
  
  modal.classList.remove("hidden");
  
  const btnOk = document.getElementById("btn-confirm-ok");
  const btnCancel = document.getElementById("btn-confirm-cancel");
  
  const cleanUp = () => {
    modal.classList.add("hidden");
    btnOk.onclick = null;
    btnCancel.onclick = null;
  };
  
  btnOk.onclick = () => {
    onOk();
    cleanUp();
  };
  
  btnCancel.onclick = () => {
    cleanUp();
  };
}

/* ==========================================================================
   UTILITIES
   ========================================================================== */
function formatIDR(num) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0
  }).format(num);
}
