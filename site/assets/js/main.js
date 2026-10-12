import { setupArchiveDemo } from './archive-demo.js';

setupArchiveDemo();

const copyButton = document.querySelector('#copy-install');
const copyFeedback = document.querySelector('#copy-feedback');
copyButton.addEventListener('click', async () => {
  const code = document.querySelector('#install-commands');
  try {
    await navigator.clipboard.writeText(code.textContent);
    copyFeedback.textContent = 'Commands copied. Paste them into your terminal.';
  } catch {
    const range = document.createRange();
    range.selectNodeContents(code);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    copyFeedback.textContent =
      'Select and copy the highlighted commands with your browser’s Copy command.';
  }
});
