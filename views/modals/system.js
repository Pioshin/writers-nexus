import { DataManager } from '../../DataManager.js';

let modal, form, cancelBtn, saveBtn;
let idInput, nameInput, rulesInput, roleInput;

function init() {
	modal = document.getElementById('system-modal');
	form = document.getElementById('system-form');
	cancelBtn = document.getElementById('cancel-system-modal');
	saveBtn = document.getElementById('save-system-btn');

	idInput = document.getElementById('system-id');
	nameInput = document.getElementById('sys-name');
	rulesInput = document.getElementById('sys-rules');
	roleInput = document.getElementById('sys-role');

	cancelBtn.addEventListener('click', close);
	saveBtn.addEventListener('click', save);
	form.addEventListener('submit', (e) => { e.preventDefault(); save(); });
}

function open(system = {}) {
	form.reset();
	idInput.value = system.id || '';
	nameInput.value = system.name || '';
	rulesInput.value = system.rules || '';
	roleInput.value = system.role || '';
	modal.classList.remove('hidden');
}

function close() {
	modal.classList.add('hidden');
}

async function save() {
	const name = nameInput.value.trim();
	if (!name) return;
	const currentProjectId = await DataManager.getCurrentProjectId();
	if (!currentProjectId) return alert('Nessun progetto selezionato.');

	const payload = {
		id: idInput.value || undefined,
		name,
		rules: rulesInput.value.trim(),
		role: roleInput.value.trim()
	};

	await DataManager.saveProjectItem(currentProjectId, 'systems', payload);
	document.dispatchEvent(new CustomEvent('system-saved'));
	close();
}

export default { init, open, close };
