document.querySelector('#add').onclick = () => {
  const input = document.createElement('input');
  input.id = 'dynamic-file';
  input.type = 'file';
  document.querySelector('#dynamic').append(input);
};
const drop = document.querySelector('#drop');
drop.ondragover = (e) => e.preventDefault();
drop.ondrop = (e) => {
  e.preventDefault();
  document.querySelector('#dropped').textContent = Array.from(e.dataTransfer.files)
    .map((f) => f.name)
    .join(', ');
};
document.querySelector('#open-host').attachShadow({ mode: 'open' }).innerHTML =
  '<label>Open shadow file <input id="open-file" type="file"></label>';
const closed = document.querySelector('#closed-host').attachShadow({ mode: 'closed' });
closed.innerHTML = '<label>Closed shadow file <input id="closed-file" type="file"></label>';
