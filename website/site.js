const menuButton = document.querySelector('[data-menu-button]');
const menu = document.querySelector('[data-menu]');

menuButton?.addEventListener('click', () => {
  const isOpen = menuButton.getAttribute('aria-expanded') === 'true';
  menuButton.setAttribute('aria-expanded', String(!isOpen));
  menu?.setAttribute('data-open', String(!isOpen));
});

menu?.querySelectorAll('a').forEach((link) => {
  link.addEventListener('click', () => {
    menuButton?.setAttribute('aria-expanded', 'false');
    menu?.setAttribute('data-open', 'false');
  });
});

document.querySelector('[data-year]').textContent = String(new Date().getFullYear());

document.querySelectorAll('[data-file-input]').forEach((input) => {
  input.addEventListener('change', () => {
    const label = input.closest('.file-field')?.querySelector('[data-file-label]');
    if (!label || !(input instanceof HTMLInputElement)) return;
    const count = input.files?.length ?? 0;
    label.textContent = count === 0 ? (input.multiple ? 'Choose files' : 'Choose file') : count === 1 ? input.files[0].name : `${count} files selected`;
  });
});

function setStatus(element, message, state) {
  if (!element) return;
  element.textContent = message;
  element.dataset.state = state;
}

async function errorMessage(response) {
  try {
    const data = await response.json();
    return data?.error?.message || 'Something went wrong. Please try again.';
  } catch {
    return 'Something went wrong. Please try again.';
  }
}

const allowedCvExtensions = ['pdf', 'doc', 'docx'];
const allowedPortfolioExtensions = ['pdf', 'jpg', 'jpeg', 'png'];
const fiveMegabytes = 5 * 1024 * 1024;

function extension(file) {
  return file.name.split('.').pop()?.toLowerCase() || '';
}

function validateApplicationFiles(form) {
  const cv = form.elements.namedItem('cv')?.files?.[0];
  const portfolio = Array.from(form.elements.namedItem('portfolio')?.files || []);
  if (!cv) return 'Please attach your CV.';
  if (!allowedCvExtensions.includes(extension(cv)) || cv.size > fiveMegabytes) return 'Your CV must be a PDF, DOC or DOCX file no larger than 5 MB.';
  if (portfolio.length === 0) return 'Please attach at least one portfolio file.';
  if (portfolio.length > 6) return 'Please choose no more than 6 portfolio files.';
  if (portfolio.some((file) => !allowedPortfolioExtensions.includes(extension(file)) || file.size > fiveMegabytes)) return 'Each portfolio file must be a PDF, JPG or PNG no larger than 5 MB.';
  if ([cv, ...portfolio].reduce((total, file) => total + file.size, 0) > 20 * 1024 * 1024) return 'Your combined attachments must be no larger than 20 MB.';
  return null;
}

const applicationForm = document.querySelector('[data-application-form]');
applicationForm?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const status = document.querySelector('[data-application-status]');
  if (!applicationForm.reportValidity()) return;
  const fileError = validateApplicationFiles(applicationForm);
  if (fileError) {
    setStatus(status, fileError, 'error');
    return;
  }

  const button = applicationForm.querySelector('button[type="submit"]');
  button.disabled = true;
  button.setAttribute('aria-busy', 'true');
  setStatus(status, 'Sending your application…', 'pending');
  try {
    const response = await fetch('/v1/public/professional-applications', { method: 'POST', body: new FormData(applicationForm) });
    if (!response.ok) throw new Error(await errorMessage(response));
    applicationForm.reset();
    applicationForm.querySelectorAll('[data-file-label]').forEach((label, index) => { label.textContent = index === 0 ? 'Choose file' : 'Choose files'; });
    setStatus(status, 'Thank you. Your application has been received and the Konjo team will review it privately.', 'success');
  } catch (error) {
    setStatus(status, error instanceof Error ? error.message : 'We could not send your application. Please try again or email HR@Konjo.com.', 'error');
  } finally {
    button.disabled = false;
    button.removeAttribute('aria-busy');
  }
});

const contactForm = document.querySelector('[data-contact-form]');
contactForm?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const status = document.querySelector('[data-contact-status]');
  if (!contactForm.reportValidity()) return;
  const button = contactForm.querySelector('button[type="submit"]');
  button.disabled = true;
  button.setAttribute('aria-busy', 'true');
  setStatus(status, 'Sending your message…', 'pending');
  try {
    const formData = new FormData(contactForm);
    const response = await fetch('/v1/public/contact', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(Object.fromEntries(formData.entries())),
    });
    if (!response.ok) throw new Error(await errorMessage(response));
    contactForm.reset();
    setStatus(status, 'Thank you. Your message has been sent to the Konjo team.', 'success');
  } catch (error) {
    setStatus(status, error instanceof Error ? error.message : 'We could not send your message. Please try again or email info@konjoet.com.', 'error');
  } finally {
    button.disabled = false;
    button.removeAttribute('aria-busy');
  }
});
