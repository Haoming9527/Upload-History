import { assignmentSample } from './samples.js';

const FILE_LIMIT = 10 * 1024 * 1024;
const ARCHIVE_LIMIT = 50 * 1024 * 1024;
const RECORD_LIMIT = 5;

function formatSize(bytes) {
  if (bytes === 0) return '0 bytes';
  if (bytes < 1024) return `${bytes} ${bytes === 1 ? 'byte' : 'bytes'}`;
  const unit = bytes < 1024 * 1024 ? 'KiB' : 'MiB';
  const divisor = unit === 'KiB' ? 1024 : 1024 * 1024;
  return `${(bytes / divisor).toLocaleString(undefined, { maximumFractionDigits: 1 })} ${unit}`;
}

export function setupArchiveDemo() {
  const form = document.querySelector('#assignment-form');
  const input = document.querySelector('#assignment-file');
  const choose = document.querySelector('#choose-file');
  const sample = document.querySelector('#use-sample');
  const dropZone = document.querySelector('#drop-zone');
  const selection = document.querySelector('#selected-file');
  const selectedName = document.querySelector('#selected-name');
  const selectedSize = document.querySelector('#selected-size');
  const remove = document.querySelector('#remove-file');
  const submit = document.querySelector('#submit-assignment');
  const feedback = document.querySelector('#form-feedback');
  const empty = document.querySelector('#history-empty');
  const list = document.querySelector('#saved-records');
  const count = document.querySelector('#saved-count');
  const historyFeedback = document.querySelector('#history-feedback');
  const template = document.querySelector('#saved-record-template');
  const initialFeedback = feedback.textContent;
  const initialHistoryFeedback = historyFeedback.textContent;
  const downloadUrls = new Map();
  let selected = null;
  let submitted = false;
  let saving = false;
  let generation = 0;
  let dragDepth = 0;
  let savedBytes = 0;
  let records = [];

  function limitMessage(file) {
    if (file.size > FILE_LIMIT) return 'Choose a file up to 10 MiB for this demo.';
    if (records.length >= RECORD_LIMIT) {
      return 'This demo holds 5 saved files. Reset the demo to try again.';
    }
    if (savedBytes + file.size > ARCHIVE_LIMIT) {
      return 'This demo has reached its 50 MiB limit. Reset the demo to try again.';
    }
    return '';
  }

  function renderSelection() {
    selection.hidden = !selected;
    selectedName.textContent = selected?.name ?? '';
    selectedSize.textContent = selected ? formatSize(selected.size) : '';
    submit.disabled = !selected || submitted || saving || Boolean(limitMessage(selected));
    submit.textContent = saving ? 'Saving…' : submitted ? 'Submitted' : 'Submit assignment';
    form.setAttribute('aria-busy', String(saving));
  }

  function clearSelection(message = initialFeedback) {
    generation += 1;
    selected = null;
    submitted = false;
    saving = false;
    input.value = '';
    feedback.textContent = message;
    renderSelection();
  }

  function selectFile(file) {
    generation += 1;
    selected = file;
    submitted = false;
    saving = false;
    feedback.textContent =
      limitMessage(file) || 'Ready to submit. Your saved copy will appear in Upload History.';
    renderSelection();
  }

  function releaseDownload(url) {
    clearTimeout(downloadUrls.get(url));
    downloadUrls.delete(url);
    URL.revokeObjectURL(url);
  }

  function download(record) {
    const url = URL.createObjectURL(record.copy);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = record.name;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    downloadUrls.set(
      url,
      setTimeout(() => releaseDownload(url), 30_000),
    );
    historyFeedback.textContent = `Download started: ${record.name}`;
  }

  function renderRecord(record) {
    const row = template.content.firstElementChild.cloneNode(true);
    row.querySelector('.saved-name').textContent = record.name;
    row.querySelector('.saved-meta').textContent = `Assignment demo · ${formatSize(record.size)}`;
    const time = row.querySelector('.saved-time');
    time.dateTime = record.savedAt.toISOString();
    time.textContent = `Saved ${new Intl.DateTimeFormat(undefined, {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    }).format(record.savedAt)}`;
    time.title = record.savedAt.toLocaleString();
    const downloadButton = row.querySelector('.saved-download');
    downloadButton.setAttribute('aria-label', `Download saved copy of ${record.name}`);
    downloadButton.addEventListener('click', () => download(record));
    row.classList.add('is-new');
    list.prepend(row);
    empty.hidden = true;
    list.hidden = false;
    count.textContent = `${records.length} saved`;
    historyFeedback.textContent = `Copy saved: ${record.name}. You can download it below.`;
    if (window.matchMedia('(max-width: 749px)').matches) {
      row.scrollIntoView({
        behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches
          ? 'instant'
          : 'smooth',
        block: 'nearest',
      });
    }
  }

  choose.addEventListener('click', () => {
    // Clearing the native value lets a visitor select the same file again.
    input.value = '';
    input.click();
  });
  input.addEventListener('change', () => {
    if (input.files.length === 1) selectFile(input.files[0]);
    else if (input.files.length > 1) clearSelection('Choose one assignment file at a time.');
  });
  sample.addEventListener('click', () => {
    input.value = '';
    selectFile(
      new File([assignmentSample.content], assignmentSample.name, { type: assignmentSample.type }),
    );
  });
  remove.addEventListener('click', () => {
    clearSelection();
    choose.focus();
  });

  dropZone.addEventListener('dragenter', (event) => {
    event.preventDefault();
    dragDepth += 1;
    dropZone.classList.add('is-dragging');
  });
  dropZone.addEventListener('dragover', (event) => {
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
  });
  dropZone.addEventListener('dragleave', () => {
    dragDepth = Math.max(0, dragDepth - 1);
    if (dragDepth === 0) dropZone.classList.remove('is-dragging');
  });
  dropZone.addEventListener('drop', (event) => {
    event.preventDefault();
    dragDepth = 0;
    dropZone.classList.remove('is-dragging');
    input.value = '';
    const files = event.dataTransfer?.files;
    if (files?.length === 1) selectFile(files[0]);
    else clearSelection('Drop one assignment file at a time.');
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!selected || saving || submitted) return;
    const error = limitMessage(selected);
    if (error) {
      feedback.textContent = error;
      return;
    }
    const file = selected;
    const currentGeneration = generation;
    saving = true;
    feedback.textContent = 'Saving your assignment copy…';
    renderSelection();
    try {
      // Yield so the busy state can render, then read only the submitted file.
      await new Promise((resolve) => requestAnimationFrame(resolve));
      if (generation !== currentGeneration) return;
      const bytes = await file.arrayBuffer();
      if (generation !== currentGeneration) return;
      const copy = new Blob([bytes], { type: file.type || 'application/octet-stream' });
      const record = { name: file.name, size: copy.size, copy, savedAt: new Date() };
      records.push(record);
      savedBytes += copy.size;
      submitted = true;
      renderRecord(record);
      feedback.textContent = 'Assignment submitted. A copy is saved in Upload History.';
    } catch {
      if (generation !== currentGeneration) return;
      feedback.textContent = 'Could not read this file. Submit again, or choose another file.';
    } finally {
      if (generation === currentGeneration) {
        saving = false;
        renderSelection();
      }
    }
  });

  document.querySelector('#reset-demo').addEventListener('click', () => {
    clearSelection();
    records = [];
    savedBytes = 0;
    list.replaceChildren();
    list.hidden = true;
    empty.hidden = false;
    count.textContent = '0 saved';
    historyFeedback.textContent = initialHistoryFeedback;
    for (const url of downloadUrls.keys()) releaseDownload(url);
    dragDepth = 0;
    dropZone.classList.remove('is-dragging');
    choose.focus();
  });
  renderSelection();
}
