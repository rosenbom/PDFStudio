const tabs = document.querySelectorAll('.tab');
const panels = document.querySelectorAll('.tab-panel');
const statusElement = document.getElementById('status');
const operationsContainer = document.getElementById('operations');
const rangesContainer = document.getElementById('ranges');
const addOperationButton = document.getElementById('add-operation');
const addRangeButton = document.getElementById('add-range');

function setStatus(message, isError = false) {
  statusElement.textContent = message;
  statusElement.classList.toggle('error', isError);
}

function createOperationRow() {
  const row = document.createElement('div');
  row.className = 'row';
  row.innerHTML = `
    <label>
      Target page in base PDF
      <input type="number" min="1" name="targetPage" required />
    </label>
    <label>
      Source page in replacement PDF
      <input type="number" min="1" name="sourcePage" required />
    </label>
    <button type="button" class="ghost">Remove</button>
  `;

  row.querySelector('button').addEventListener('click', () => row.remove());
  operationsContainer.appendChild(row);
}

function createRangeRow() {
  const row = document.createElement('div');
  row.className = 'row';
  row.innerHTML = `
    <label>
      Start page
      <input type="number" min="1" name="start" required />
    </label>
    <label>
      End page
      <input type="number" min="1" name="end" required />
    </label>
    <button type="button" class="ghost">Remove</button>
  `;

  row.querySelector('button').addEventListener('click', () => row.remove());
  rangesContainer.appendChild(row);
}

async function submitForm(url, formData, filename) {
  setStatus('Processing PDF...');
  const response = await fetch(url, { method: 'POST', body: formData });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({ error: 'Request failed.' }));
    throw new Error(payload.error || 'Request failed.');
  }

  const blob = await response.blob();
  const downloadUrl = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = downloadUrl;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(downloadUrl);
  setStatus('Your PDF is ready.');
}

tabs.forEach((tab) => {
  tab.addEventListener('click', () => {
    tabs.forEach((item) => item.classList.remove('active'));
    panels.forEach((panel) => panel.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById(`${tab.dataset.tab}-panel`).classList.add('active');
    setStatus('');
  });
});

addOperationButton.addEventListener('click', createOperationRow);
addRangeButton.addEventListener('click', createRangeRow);
createOperationRow();
createRangeRow();

document.getElementById('replace-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  try {
    const form = event.currentTarget;
    const formData = new FormData(form);
    const operations = Array.from(operationsContainer.querySelectorAll('.row')).map((row) => ({
      targetPage: row.querySelector('[name="targetPage"]').value,
      sourcePage: row.querySelector('[name="sourcePage"]').value
    }));
    formData.append('operations', JSON.stringify(operations));
    await submitForm('/api/process', formData, 'processed.pdf');
  } catch (error) {
    setStatus(error.message, true);
  }
});

document.getElementById('merge-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  try {
    const formData = new FormData(event.currentTarget);
    await submitForm('/api/merge', formData, 'merged.pdf');
  } catch (error) {
    setStatus(error.message, true);
  }
});

document.getElementById('split-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  try {
    const form = event.currentTarget;
    const formData = new FormData(form);
    const ranges = Array.from(rangesContainer.querySelectorAll('.row')).map((row) => ({
      start: row.querySelector('[name="start"]').value,
      end: row.querySelector('[name="end"]').value
    }));
    formData.append('ranges', JSON.stringify(ranges));
    await submitForm('/api/split', formData, 'split.pdf');
  } catch (error) {
    setStatus(error.message, true);
  }
});