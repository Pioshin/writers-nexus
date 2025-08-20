import { DataManager } from '../../DataManager.js';

let modal, form, cancelBtn, saveBtn;
let idInput, nameInput, descriptionInput, historyInput, roleInput;

function init() {
	modal = document.getElementById('location-modal');
	form = document.getElementById('location-form');
	cancelBtn = document.getElementById('cancel-location-modal');
	saveBtn = document.getElementById('save-location-btn');

	idInput = document.getElementById('location-id');
	nameInput = document.getElementById('loc-name');
	descriptionInput = document.getElementById('loc-description');
	historyInput = document.getElementById('loc-history');
	roleInput = document.getElementById('loc-role');

	cancelBtn.addEventListener('click', close);
	saveBtn.addEventListener('click', save);
	form.addEventListener('submit', (e) => { e.preventDefault(); save(); });
}

function open(location = {}) {
	form.reset();
	idInput.value = location.id || '';
	nameInput.value = location.name || '';
	descriptionInput.value = location.description || '';
	historyInput.value = location.history || '';
	roleInput.value = location.role || '';
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
		description: descriptionInput.value.trim(),
		history: historyInput.value.trim(),
		role: roleInput.value.trim()
	};

	await DataManager.saveProjectItem(currentProjectId, 'locations', payload);
	document.dispatchEvent(new CustomEvent('location-saved'));
	close();
}

export default { init, open, close };
