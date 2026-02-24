// State management
let emissionsData = [
  {
    id: '1',
    companyName: 'Acme Corp',
    year: 2023,
    revenue: 15400000,
    scope1: 1200.5,
    scope2: 850.2,
    scope3: 4500.0,
    totalEmissions: 6550.7,
    intensity: 425.37
  },
  {
    id: '2',
    companyName: 'GreenTech Solutions',
    year: 2023,
    revenue: 8200000,
    scope1: 45.0,
    scope2: 120.5,
    scope3: 310.0,
    totalEmissions: 475.5,
    intensity: 57.98
  },
  {
    id: '3',
    companyName: 'Global Logistics',
    year: 2022,
    revenue: 45000000,
    scope1: 15400.0,
    scope2: 3200.0,
    scope3: 28500.0,
    totalEmissions: 47100.0,
    intensity: 1046.66
  }
];

// DOM Elements
const form = document.getElementById('emission-form');
const tableBody = document.getElementById('tableBody');
const searchInput = document.getElementById('searchCompany');
const totalRecordsEl = document.getElementById('total-records');
const avgIntensityEl = document.getElementById('avg-intensity');
const toastEl = document.getElementById('toast');
const exportBtn = document.getElementById('exportBtn');
const companyNameInput = document.getElementById('companyName');

// Formatting utilities
const formatCurrency = (value) => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(value);
};

const formatNumber = (value) => {
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(value);
};

// Initialize app
function init() {
  renderTable(emissionsData);
  updateStats(emissionsData);

  // Create an auto-fill button
  const autoFillBtn = document.createElement('button');
  autoFillBtn.type = 'button';
  autoFillBtn.className = 'btn-secondary btn-small auto-fill-btn';
  autoFillBtn.innerHTML = `
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
    Auto-Collect Data
  `;
  autoFillBtn.style.marginTop = '0.5rem';

  // Insert it after the company name input
  const companyGroup = companyNameInput.closest('.form-group');
  companyGroup.appendChild(autoFillBtn);

  autoFillBtn.addEventListener('click', handleAutoCollect);

  // Event Listeners
  form.addEventListener('submit', handleFormSubmit);
  searchInput.addEventListener('input', handleSearch);
  exportBtn.addEventListener('click', handleExport);
}

// Render data into the table
function renderTable(data) {
  if (data.length === 0) {
    tableBody.innerHTML = `
      <tr>
        <td colspan="6" class="empty-state">No records matching your search. Add data to get started.</td>
      </tr>
    `;
    return;
  }

  tableBody.innerHTML = data.map(record => `
    <tr>
      <td class="company-name">${record.companyName}</td>
      <td>${record.year}</td>
      <td class="text-right">${formatCurrency(record.revenue)}</td>
      <td class="text-right">${formatNumber(record.totalEmissions)}</td>
      <td class="text-right value-highlight">${formatNumber(record.intensity)}</td>
      <td class="text-right">
        <button class="btn-danger" onclick="deleteRecord('${record.id}')" title="Delete record">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="3 6 5 6 21 6"></polyline>
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
          </svg>
        </button>
      </td>
    </tr>
  `).join('');
}

// Update dashboard statistics
function updateStats(data) {
  totalRecordsEl.textContent = data.length;

  if (data.length === 0) {
    avgIntensityEl.innerHTML = `0.00 <span class="unit">tCO₂e/$M</span>`;
    return;
  }

  const totalIntensity = data.reduce((acc, curr) => acc + curr.intensity, 0);
  const avgIntensity = totalIntensity / data.length;

  avgIntensityEl.innerHTML = `${formatNumber(avgIntensity)} <span class="unit">tCO₂e/$M</span>`;
}

// Handle Auto Collect via Backend
async function handleAutoCollect() {
  const company = companyNameInput.value.trim();
  const yearInput = document.getElementById('reportYear').value;

  if (!company) {
    alert("Please enter a company name first.");
    return;
  }

  const targetYear = yearInput ? parseInt(yearInput) : new Date().getFullYear() - 1;
  const btn = document.querySelector('.auto-fill-btn');
  const originalText = btn.innerHTML;
  btn.innerHTML = `<span class="loading-spinner"></span> Collecting...`;
  btn.disabled = true;

  try {
    // In production, we use the relative path so Vercel resolves it automatically.
    // In local development, you could replace this with http://localhost:3000/api/lookup or run via a proxy.
    const url = new URL('/api/lookup', window.location.origin);
    url.searchParams.append('company', company);
    url.searchParams.append('year', targetYear);

    const response = await fetch(url.toString());
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Failed to fetch data');
    }

    // Fill the form fields
    companyNameInput.value = data.companyName;
    document.getElementById('reportYear').value = data.year;
    document.getElementById('revenue').value = data.revenue;
    document.getElementById('scope1').value = data.scope1;
    document.getElementById('scope2').value = data.scope2;
    document.getElementById('scope3').value = data.scope3;

    showToastMsg(`Successfully collected estimated data for ${data.ticker}`);

  } catch (err) {
    alert("Error finding company data: " + err.message);
  } finally {
    btn.innerHTML = originalText;
    btn.disabled = false;
  }
}

// Handle form submission
function handleFormSubmit(e) {
  e.preventDefault();

  // Get values
  const companyName = document.getElementById('companyName').value;
  const year = parseInt(document.getElementById('reportYear').value);
  const revenue = parseFloat(document.getElementById('revenue').value);
  const scope1 = parseFloat(document.getElementById('scope1').value);
  const scope2 = parseFloat(document.getElementById('scope2').value);
  const scope3 = parseFloat(document.getElementById('scope3').value);

  // Calculate totals
  const totalEmissions = scope1 + scope2 + scope3;
  // Intensity: metric tons of CO2e per million $ revenue
  const revenueInMillions = revenue / 1000000;
  const intensity = revenueInMillions > 0 ? (totalEmissions / revenueInMillions) : 0;

  // Create object
  const newRecord = {
    id: Date.now().toString(),
    companyName,
    year,
    revenue,
    scope1,
    scope2,
    scope3,
    totalEmissions,
    intensity
  };

  // Update state
  emissionsData.unshift(newRecord);

  // Re-render
  renderTable(emissionsData);
  updateStats(emissionsData);

  // Reset form
  form.reset();

  // Show toast validation
  showToast();

  // If there's an active search, re-apply it
  handleSearch({ target: searchInput });
}

// Handle search/filtering
function handleSearch(e) {
  const searchTerm = e.target.value.toLowerCase();

  if (!searchTerm) {
    renderTable(emissionsData);
    return;
  }

  const filteredData = emissionsData.filter(record => {
    return record.companyName.toLowerCase().includes(searchTerm) ||
      record.year.toString().includes(searchTerm);
  });

  renderTable(filteredData);
}

// Delete record
window.deleteRecord = function (id) {
  if (confirm('Are you sure you want to delete this record?')) {
    emissionsData = emissionsData.filter(record => record.id !== id);
    renderTable(emissionsData);
    updateStats(emissionsData);
    // Maintain filter if any
    handleSearch({ target: searchInput });
  }
};

// Export to CSV
function handleExport() {
  if (emissionsData.length === 0) return;

  // Define columns
  const headers = ['Company Name', 'Year', 'Revenue (USD)', 'Scope 1 (tCO2e)', 'Scope 2 (tCO2e)', 'Scope 3 (tCO2e)', 'Total Emissions (tCO2e)', 'Intensity (tCO2e/$M)'];

  // Map data to CSV rows
  const csvRows = [
    headers.join(','),
    ...emissionsData.map(row => [
      `"${row.companyName}"`,
      row.year,
      row.revenue,
      row.scope1,
      row.scope2,
      row.scope3,
      row.totalEmissions,
      row.intensity.toFixed(2)
    ].join(','))
  ];

  const csvString = csvRows.join('\n');
  const blob = new Blob([csvString], { type: 'text/csv' });
  const url = window.URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.setAttribute('href', url);
  a.setAttribute('download', 'emissions_data.csv');
  a.click();

  window.URL.revokeObjectURL(url);
}

// Show success toast
function showToast() {
  showToastMsg('Record saved successfully!');
}

function showToastMsg(message) {
  document.getElementById('toast-message').textContent = message;
  toastEl.classList.add('show');

  setTimeout(() => {
    toastEl.classList.remove('show');
  }, 3000);
}

// Run init when DOM is fully loaded
document.addEventListener('DOMContentLoaded', init);
