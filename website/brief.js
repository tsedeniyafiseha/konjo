// ==========================================================================
// Konjo — Technical Build Brief Interactive Scripts
// ==========================================================================

document.addEventListener('DOMContentLoaded', () => {
  initSurfaceTabs();
  initLifecycleStepper();
  initCommissionCalculator();
  initProposalCalculator();
  initLanguageSwitcher();
  initPrintHandlers();
});

// 1. Surface Switcher Tabs
function initSurfaceTabs() {
  const tabButtons = document.querySelectorAll('[data-tab-target]');
  const panels = document.querySelectorAll('.surface-panel');

  tabButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      const targetId = btn.getAttribute('data-tab-target');

      // Update button states
      tabButtons.forEach((b) => {
        b.classList.remove('active');
        b.setAttribute('aria-selected', 'false');
      });
      btn.classList.add('active');
      btn.setAttribute('aria-selected', 'true');

      // Update panel visibility
      panels.forEach((p) => {
        if (p.id === targetId) {
          p.classList.add('active');
          p.removeAttribute('hidden');
        } else {
          p.classList.remove('active');
          p.setAttribute('hidden', '');
        }
      });
    });
  });
}

// 2. Booking Lifecycle Stepper
function initLifecycleStepper() {
  const nodes = document.querySelectorAll('[data-step]');
  const prevBtn = document.querySelector('[data-step-prev]');
  const nextBtn = document.querySelector('[data-step-next]');
  const indicator = document.querySelector('[data-step-indicator]');

  const stepNames = [
    'Stage 1 of 6: Client Books (Escrow Locked)',
    'Stage 2 of 6: Pro 15-Min SLA (Auto-Reassign)',
    'Stage 3 of 6: Arrival & Check-In',
    'Stage 4 of 6: Service & Live Session Timer',
    'Stage 5 of 6: Check-Out & Dual Rating',
    'Stage 6 of 6: Escrow Release & Weekly Payout',
  ];

  let currentStep = 1;
  const totalSteps = nodes.length;

  function updateStep(newStep) {
    if (newStep < 1 || newStep > totalSteps) return;
    currentStep = newStep;

    nodes.forEach((node) => {
      const stepVal = parseInt(node.getAttribute('data-step'), 10);
      if (stepVal === currentStep) {
        node.classList.add('active');
      } else {
        node.classList.remove('active');
      }
    });

    if (indicator) {
      indicator.textContent = stepNames[currentStep - 1];
    }
  }

  prevBtn?.addEventListener('click', () => {
    updateStep(currentStep > 1 ? currentStep - 1 : totalSteps);
  });

  nextBtn?.addEventListener('click', () => {
    updateStep(currentStep < totalSteps ? currentStep + 1 : 1);
  });

  nodes.forEach((node) => {
    node.addEventListener('click', () => {
      const stepVal = parseInt(node.getAttribute('data-step'), 10);
      updateStep(stepVal);
    });
  });
}

// 3. Escrow & Commission Calculator
function initCommissionCalculator() {
  const priceInput = document.getElementById('calc-service-price');
  const zoneSelect = document.getElementById('calc-zone');

  const displayPrice = document.getElementById('display-service-price');
  const totalClient = document.getElementById('calc-total-client');
  const ledgerService = document.getElementById('calc-ledger-service');
  const ledgerTravel = document.getElementById('calc-ledger-travel');
  const ledgerCommission = document.getElementById('calc-ledger-commission');
  const ledgerProService = document.getElementById('calc-ledger-pro-service');
  const ledgerProTravel = document.getElementById('calc-ledger-pro-travel');
  const totalPro = document.getElementById('calc-total-pro');

  function formatETB(amount) {
    return new Intl.NumberFormat('en-US').format(Math.round(amount)) + ' ETB';
  }

  function calculate() {
    if (!priceInput || !zoneSelect) return;

    const servicePrice = parseFloat(priceInput.value) || 0;
    const travelFee = parseFloat(zoneSelect.value) || 0;

    const clientTotal = servicePrice + travelFee;
    const commission = Math.round(servicePrice * 0.18);
    const proServiceShare = servicePrice - commission;
    const proWeeklyPayout = proServiceShare + travelFee;

    if (displayPrice) displayPrice.textContent = formatETB(servicePrice);
    if (totalClient) totalClient.textContent = formatETB(clientTotal);
    if (ledgerService) ledgerService.textContent = formatETB(servicePrice);
    if (ledgerTravel) ledgerTravel.textContent = formatETB(travelFee);
    if (ledgerCommission) ledgerCommission.textContent = '− ' + formatETB(commission);
    if (ledgerProService) ledgerProService.textContent = '+ ' + formatETB(proServiceShare);
    if (ledgerProTravel) ledgerProTravel.textContent = '+ ' + formatETB(travelFee);
    if (totalPro) totalPro.textContent = formatETB(proWeeklyPayout);
  }

  priceInput?.addEventListener('input', calculate);
  zoneSelect?.addEventListener('change', calculate);
  calculate();
}

// 4. Jelani Proposal & Costing Sandbox
function initProposalCalculator() {
  const stipendInput = document.getElementById('p-stipend');
  const studentsInput = document.getElementById('p-students');
  const retainedInput = document.getElementById('p-retained');
  const startDateInput = document.getElementById('p-start-date');
  const leadNameInput = document.getElementById('p-lead-name');
  const notesInput = document.getElementById('p-notes');

  const totalBuildEl = document.getElementById('p-total-build');
  const monthlyRetainerEl = document.getElementById('p-monthly-retainer');
  const generateBtn = document.getElementById('btn-generate-summary');
  const outputBox = document.getElementById('proposal-output');
  const outputText = document.getElementById('proposal-text');
  const emailLink = document.getElementById('btn-email-addis');

  function formatCurrency(val) {
    return new Intl.NumberFormat('en-US').format(Math.round(val)) + ' ETB';
  }

  function updateCalculations() {
    const stipend = parseFloat(stipendInput?.value) || 35000;
    const students = parseInt(studentsInput?.value, 10) || 5;
    const retained = parseInt(retainedInput?.value, 10) || 2;

    // 10 weeks = 2.5 months
    const totalBuild = stipend * students * 2.5;
    const monthlyRetainer = stipend * retained;

    if (totalBuildEl) totalBuildEl.textContent = formatCurrency(totalBuild);
    if (monthlyRetainerEl) monthlyRetainerEl.textContent = formatCurrency(monthlyRetainer) + ' / mo';

    return { stipend, students, retained, totalBuild, monthlyRetainer };
  }

  stipendInput?.addEventListener('input', updateCalculations);
  studentsInput?.addEventListener('input', updateCalculations);
  retainedInput?.addEventListener('input', updateCalculations);

  generateBtn?.addEventListener('click', () => {
    const { stipend, students, retained, totalBuild, monthlyRetainer } = updateCalculations();
    const startDate = startDateInput?.value || '2026-10-01';
    const leadName = leadNameInput?.value || 'Addis Coders Mentor';
    const notes = notesInput?.value || '';

    const summary = `MEMORANDUM: TECHNICAL BUILD RESPONSE FOR KONJO
----------------------------------------------------------------------
TO: Addis Alemayehou, Tati, Sara (Konjo Founders)
FROM: Jelani & Addis Coders Engineering Team
DATE: ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
PROJECT: Konjo At-Home Beauty & Massage Marketplace (Addis Ababa)
----------------------------------------------------------------------

1. ACCEPTANCE & EARLIEST START DATE:
   YES. The Addis Coders team accepts this build brief under Jelani's supervision.
   Confirmed Earliest Start Date: ${startDate}

2. PROPOSED TEAM ROSTER:
   - Technical Supervisor: Jelani
   - Lead Architect: ${leadName}
   - Mobile Developers (2): React Native / Expo Specialists
   - Backend Developer (1): PostgreSQL, Node.js / FastAPI & Queues
   - UI/UX Designer (1): Figma Mobile Design System
   - QA Engineer (Part-Time): Addis Device Lab & Network Testing

3. 10-WEEK BUILD COSTING & POST-LAUNCH RETAINER:
   - Student Stipend Rate: ${formatCurrency(stipend)} / student / month
   - Full Build Squad (${students} Students for 10 Weeks / 2.5 Months): ${formatCurrency(totalBuild)}
   - Payment Tranches (Tied to Verified Milestones):
     * Tranche 1 (Weeks 1-2 Figma & API Spec Sign-off): 30% (${formatCurrency(totalBuild * 0.3)})
     * Tranche 2 (Weeks 3-7 Staging & Test Bookings): 40% (${formatCurrency(totalBuild * 0.4)})
     * Tranche 3 (Week 10 Play Store Release & Handover): 30% (${formatCurrency(totalBuild * 0.3)})
   - Post-Launch Retainer (${retained} Students for Maintenance & Phase 2): ${formatCurrency(monthlyRetainer)} / month

4. TECHNICAL ARCHITECTURE & TIMELINE RECOMMENDATIONS:
   ${notes}

5. KICK-OFF CONFERENCE:
   Ready for a 30-minute kick-off with Tati, Sara, and Addis within 48 hours.
   All IP assignments and confidentiality agreements will be signed prior to Week 1 discovery.
----------------------------------------------------------------------`;

    if (outputText) outputText.textContent = summary;
    if (outputBox) outputBox.removeAttribute('hidden');

    if (emailLink) {
      const subject = encodeURIComponent('Konjo Build Brief Response - Jelani, Addis Coders');
      const body = encodeURIComponent(summary);
      emailLink.href = `mailto:Addis@Konjo.com?cc=Tati@Konjo.com,Sara@Konjo.com&subject=${subject}&body=${body}`;
    }

    outputBox?.scrollIntoView({ behavior: 'smooth' });
  });
}

// 5. Bilingual Amharic / English Toggle
function initLanguageSwitcher() {
  const langBtns = document.querySelectorAll('[data-lang-choice]');
  const body = document.body;

  const translations = {
    en: {
      tagline: 'At-home beauty, grooming and massage marketplace for Addis Ababa.',
      clientTitle: 'Client App',
      proTitle: 'Professional App',
      adminTitle: 'Admin Panel',
    },
    am: {
      tagline: 'በአዲስ አበባ የውበት፣ የጸጉር እና የማሳጅ አገልግሎት በቤትዎ የሚቀርብበት መድረክ።',
      clientTitle: 'የደንበኞች መተግበሪያ (Client App)',
      proTitle: 'የባለሙያዎች መተግበሪያ (Professional App)',
      adminTitle: 'የአስተዳዳሪ ፓነል (Admin Panel)',
    },
  };

  langBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      const lang = btn.getAttribute('data-lang-choice');
      if (!lang) return;

      langBtns.forEach((b) => {
        b.classList.remove('active');
        b.setAttribute('aria-pressed', 'false');
      });
      btn.classList.add('active');
      btn.setAttribute('aria-pressed', 'true');

      body.setAttribute('data-lang', lang);

      // Apply key text changes
      const taglineEl = document.querySelector('[data-t-key="tagline"]');
      if (taglineEl && translations[lang]) {
        taglineEl.textContent = translations[lang].tagline;
      }
    });
  });
}

// 6. Print / PDF Export
function initPrintHandlers() {
  const printBtns = document.querySelectorAll('[data-print-trigger]');
  printBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      window.print();
    });
  });
}
