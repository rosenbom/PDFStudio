const tabs = document.querySelectorAll('.tab');
const panels = document.querySelectorAll('.tab-panel');
const statusElement = document.getElementById('status');
const operationsContainer = document.getElementById('operations');
const rangesContainer = document.getElementById('ranges');
const addOperationButton = document.getElementById('add-operation');
const addRangeButton = document.getElementById('add-range');
const splitForm = document.getElementById('split-form');
const splitWarningElement = document.getElementById('split-warning');
const rangesPanel = document.getElementById('ranges-panel');
const chunkSizePanel = document.getElementById('chunk-size-panel');
const chunkSizeInput = document.getElementById('chunk-size-input');
const autoCompleteFinalChunkInput = document.getElementById('auto-complete-final-chunk');
const splitModeInputs = document.querySelectorAll('input[name="splitMode"]');

function setStatus(message, isError = false) {
  statusElement.textContent = message;
  statusElement.classList.toggle('error', isError);
}

function setSplitWarning(message, isError = false) {
  splitWarningElement.textContent = message;
  splitWarningElement.classList.toggle('error', isError);
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

  row.querySelector('button').addEventListener('click', () => {
    row.remove();
    updateSplitWarning();
  });
  row.querySelectorAll('input').forEach((input) => {
    input.addEventListener('input', updateSplitWarning);
  });
  rangesContainer.appendChild(row);
  updateSplitWarning();
}

function getSelectedSplitMode() {
  return Array.from(splitModeInputs).find((input) => input.checked)?.value ?? 'ranges';
}

function parsePositiveInteger(value) {
  const parsedValue = Number.parseInt(value, 10);
  return Number.isInteger(parsedValue) && parsedValue > 0 ? parsedValue : null;
}

function getManualRanges() {
  return Array.from(rangesContainer.querySelectorAll('.row')).map((row) => ({
    start: parsePositiveInteger(row.querySelector('[name="start"]').value),
    end: parsePositiveInteger(row.querySelector('[name="end"]').value)
  }));
}

function getCompleteManualRanges() {
  return getManualRanges().filter((range) => range.start !== null && range.end !== null);
}

function analyzeRanges(ranges) {
  const completeRanges = ranges
    .filter((range) => range.start !== null && range.end !== null)
    .sort((left, right) => left.start - right.start);
  const issues = [];

  for (const range of completeRanges) {
    if (range.end < range.start) {
      issues.push(`Range ${range.start}-${range.end} is invalid.`);
    }
  }

  for (let index = 1; index < completeRanges.length; index += 1) {
    const previousRange = completeRanges[index - 1];
    const currentRange = completeRanges[index];

    if (currentRange.start <= previousRange.end) {
      issues.push(`Ranges ${previousRange.start}-${previousRange.end} and ${currentRange.start}-${currentRange.end} overlap.`);
    }
  }

  return {
    completeRanges,
    issues
  };
}

function updateSplitModeUi() {
  const splitMode = getSelectedSplitMode();
  const isChunkMode = splitMode === 'chunkSize';
  rangesPanel.classList.toggle('hidden', isChunkMode);
  chunkSizePanel.classList.toggle('hidden', !isChunkMode);
  addRangeButton.disabled = isChunkMode;
  chunkSizeInput.required = isChunkMode;
  rangesContainer.querySelectorAll('input').forEach((input) => {
    input.required = !isChunkMode;
  });
  updateSplitWarning();
}

function updateSplitWarning() {
  const splitMode = getSelectedSplitMode();

  if (splitMode === 'chunkSize') {
    const chunkSize = parsePositiveInteger(chunkSizeInput.value);
    if (chunkSize === null && chunkSizeInput.value.trim() !== '') {
      setSplitWarning('Chunk size must be a positive integer.', true);
      return;
    }

    setSplitWarning(chunkSize ? 'The app will generate consecutive chunks and include the final shorter chunk automatically.' : 'Enter a chunk size to generate consecutive files automatically.');
    return;
  }

  const { completeRanges, issues } = analyzeRanges(getManualRanges());

  if (issues.length > 0) {
    setSplitWarning(issues[0], true);
    return;
  }

  if (completeRanges.length === 0) {
    setSplitWarning('Add one or more ranges, or switch to split-every-N-pages mode.');
    return;
  }

  const lastRange = completeRanges[completeRanges.length - 1];
  if (autoCompleteFinalChunkInput.checked) {
    setSplitWarning(`If the PDF has more pages after ${lastRange.end}, the app will add a final ${lastRange.end + 1}-last-page chunk automatically.`);
    return;
  }

  setSplitWarning(`Only the ranges you entered will be exported. Pages after ${lastRange.end} will be skipped.`);
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
splitModeInputs.forEach((input) => input.addEventListener('change', updateSplitModeUi));
chunkSizeInput.addEventListener('input', updateSplitWarning);
autoCompleteFinalChunkInput.addEventListener('change', updateSplitWarning);
createOperationRow();
createRangeRow();
updateSplitModeUi();

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

splitForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  try {
    const form = event.currentTarget;
    const formData = new FormData(form);
    const splitMode = getSelectedSplitMode();
    const ranges = splitMode === 'ranges'
      ? getCompleteManualRanges().map((range) => ({
        start: range.start,
        end: range.end
      }))
      : [];

    if (splitMode === 'ranges') {
      const { issues } = analyzeRanges(ranges);
      if (issues.length > 0) {
        throw new Error(issues[0]);
      }

      if (ranges.length === 0) {
        throw new Error('Add at least one complete page range.');
      }
    }

    formData.set('ranges', JSON.stringify(ranges));
    if (splitMode === 'chunkSize') {
      formData.set('chunkSize', chunkSizeInput.value);
    } else {
      formData.delete('chunkSize');
    }
    formData.set('autoCompleteFinalChunk', String(autoCompleteFinalChunkInput.checked));
    await submitForm('/api/split', formData, 'split.zip');
  } catch (error) {
    setStatus(error.message, true);
  }
});