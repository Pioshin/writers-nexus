import { DataManager } from '../../DataManager.js';
import { AIService } from '../../ai/AIService.js';
import { toast } from '../shared/toast.js';

let modal, form, cancelBtn, saveBtn;
let idInput, nameInput, descriptionInput, historyInput, roleInput;
let tabDetailsBtn, tabAiBtn, tabDetailsPane, tabAiPane;
let aiInstr, aiTemp, aiTempVal, aiMaxTok, aiUseCtx, aiCtxStatus, aiGenre, aiTone, aiGenBtn, aiImpBtn, aiStopBtn, aiOut, aiApply, aiCopy;

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

	// Tabs
	tabDetailsBtn = document.getElementById('loc-tab-details');
	tabAiBtn = document.getElementById('loc-tab-ai');
	tabDetailsPane = document.getElementById('loc-tab-details-pane');
	tabAiPane = document.getElementById('loc-tab-ai-pane');
	tabDetailsBtn?.addEventListener('click', () => switchTab('details'));
	tabAiBtn?.addEventListener('click', () => switchTab('ai'));

	// IA controls
	aiInstr = document.getElementById('ai-loc-instructions');
	aiTemp = document.getElementById('ai-loc-temp');
	aiTempVal = document.getElementById('ai-loc-temp-val');
	aiMaxTok = document.getElementById('ai-loc-maxtok');
	aiUseCtx = document.getElementById('ai-loc-use-context');
	aiCtxStatus = document.getElementById('ai-loc-context-status');
	aiGenre = document.getElementById('ai-loc-genre');
	aiTone = document.getElementById('ai-loc-tone');
	aiGenBtn = document.getElementById('ai-loc-generate');
	aiImpBtn = document.getElementById('ai-loc-improve');
	aiStopBtn = document.getElementById('ai-loc-stop');
	aiOut = document.getElementById('ai-loc-output');
	aiApply = document.getElementById('ai-loc-apply');
	aiCopy = document.getElementById('ai-loc-copy');
	aiTemp?.addEventListener('input', () => aiTempVal.textContent = aiTemp.value);
	aiGenBtn?.addEventListener('click', () => runAI('create'));
	aiImpBtn?.addEventListener('click', () => runAI('improve'));
	aiStopBtn?.addEventListener('click', () => AIService.abort());
	aiApply?.addEventListener('click', applyAI);
	aiCopy?.addEventListener('click', () => navigator.clipboard?.writeText(aiOut.textContent||''));

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
	switchTab('details');
	prefillProjectTone();
}

function close() {
	modal.classList.add('hidden');
}

async function save() {
	const name = nameInput.value.trim();
	if (!name) return;
	const currentProjectId = await DataManager.getCurrentProjectId();
	if (!currentProjectId) { toast.error('Nessun progetto selezionato.'); return; }

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

function switchTab(which){
	const isDetails = which === 'details';
	tabDetailsPane?.classList.toggle('hidden', !isDetails);
	tabAiPane?.classList.toggle('hidden', isDetails);
	tabDetailsBtn?.classList.toggle('bg-accent/20', isDetails);
	tabDetailsBtn?.classList.toggle('text-accent', isDetails);
	tabAiBtn?.classList.toggle('bg-accent/20', !isDetails);
	tabAiBtn?.classList.toggle('text-accent', !isDetails);
}

async function prefillProjectTone(){
	try {
		const pid = await DataManager.getCurrentProjectId();
		const p = pid ? await DataManager.getProject(pid) : null;
		if (p) {
			if (aiGenre && !aiGenre.value) aiGenre.value = p.genre || '';
			if (aiTone && !aiTone.value) aiTone.value = p.tone || '';
		}
	} catch {}
}

function buildSystemPrompt(){
	return `Sei un assistente di worldbuilding. Rispondi SOLO con JSON valido con le chiavi:\n{
  "name": string,
  "description": string,
  "history": string,
  "role": string
}`;
}

function buildUserPrompt(mode){
	const ctx = {
		name: nameInput.value.trim(),
		description: descriptionInput.value.trim(),
		history: historyInput.value.trim(),
		role: roleInput.value.trim(),
		genre: aiGenre?.value?.trim(),
		tone: aiTone?.value?.trim()
	};
	const base = mode === 'create' ? 'Crea un luogo coerente.' : 'Migliora/Completa questo luogo senza perdere coerenza.';
	return [
		base,
		aiInstr?.value?.trim() ? `Istruzioni: ${aiInstr.value.trim()}` : null,
		ctx.genre || ctx.tone ? `Genere/Tono: ${[ctx.genre, ctx.tone].filter(Boolean).join(' | ')}` : null,
		ctx.name || ctx.description || ctx.history || ctx.role ? `Dati attuali: ${JSON.stringify(ctx)}` : null
	].filter(Boolean).join('\n\n');
}

function repairJson(s){
	if (!s) return '';
	let t = String(s).trim();
	t = t.replace(/^```[a-z]*\n?/i, '').replace(/```\s*$/i, '');
	t = t.replace(/,\s*([}\]])/g, '$1');
	const a = t.indexOf('{'); const b = t.lastIndexOf('}');
	if (a !== -1 && b !== -1) t = t.slice(a, b+1);
	return t;
}

async function runAI(mode){
	aiOut.textContent = '...';
	const system = buildSystemPrompt();
	let prompt = buildUserPrompt(mode);
	if (aiUseCtx?.checked) {
		const ctx = await buildContext();
		if (ctx) prompt += `\n\nContesto dal romanzo:\n${ctx}`;
	}
	const temperature = parseFloat(aiTemp?.value ?? '0.7') || 0.7;
	const maxTokens = parseInt(aiMaxTok?.value ?? '600', 10) || 600;
	try {
		const { text } = await AIService.complete({ prompt, system, temperature, maxTokens });
		aiOut.textContent = text || '';
	} catch (e) {
		aiOut.textContent = `Errore IA: ${e.message}`;
	}
}

async function buildContext(){
	aiCtxStatus && (aiCtxStatus.textContent = 'Raccolgo contesto...');
	const pid = await DataManager.getCurrentProjectId();
	if (!pid) { aiCtxStatus && (aiCtxStatus.textContent = 'Nessun progetto'); return ''; }
	const [scenes, ideas, plotlines] = await Promise.all([
		DataManager.getProjectItems(pid, 'scenes'),
		DataManager.getProjectItems(pid, 'ideas'),
		DataManager.getProjectItems(pid, 'plotlines')
	]);
	const name = (nameInput.value||'').trim();
	const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	const tokens = name ? name.split(/\s+|-/).filter(t=>t.length>=3) : [];
	const fullRe = name ? new RegExp(`\\b${esc(name)}\\b`, 'i') : null;
	const tokenRes = tokens.map(t=>new RegExp(`\\b${esc(t)}\\b`, 'i'));
	const scoreText = (txt)=>{ if(!txt) return 0; let sc=0; if(fullRe&&fullRe.test(txt)) sc+=5; for(const r of tokenRes) if(r.test(txt)) sc+=2; return sc; };
	const center = (txt)=>{ if(!txt) return ''; let idx=-1; if(fullRe){ const m=txt.match(fullRe); if(m) idx=txt.indexOf(m[0]); } if(idx===-1){ for(const r of tokenRes){ const m=txt.match(r); if(m){ idx=txt.indexOf(m[0]); break; } } } if(idx===-1) return txt.slice(0,1000); const w=500; const st=Math.max(0, idx-w); const en=Math.min(txt.length, idx+w); return (st>0?'...':'')+txt.slice(st,en)+(en<txt.length?'...':''); };
	const scored = scenes.map(s=>{ const t=[s.title,s.synopsis,s.content].filter(Boolean).join('\n'); return { s, t, sc: scoreText(t) }; });
	scored.sort((a,b)=> (b.sc-a.sc) || ((a.s.order||0)-(b.s.order||0)) );
	let sel = scored.filter(x=>x.sc>0).slice(0,5);
	if (sel.length<3 && scenes.length){ const byOrder=[...scenes].sort((a,b)=>(a.order||0)-(b.order||0)); const seed = sel[0]?.s || byOrder[0]; const idx = byOrder.findIndex(x=>x.id===seed.id); const neigh=[idx-1,idx,idx+1,idx+2].filter(i=>i>=0&&i<byOrder.length); const ids=new Set(sel.map(x=>x.s.id)); for(const i of neigh){ const sc=byOrder[i]; if(!ids.has(sc.id)){ const t=[sc.title,sc.synopsis,sc.content].filter(Boolean).join('\n'); sel.push({ s: sc, t, sc: scoreText(t) }); ids.add(sc.id);} if(sel.length>=5) break; } }
	const sceneLines = sel.map(x=>`- ${x.s.title? '['+x.s.title+'] ': ''}${center(x.t)}`);
	const ideaHits = [];
	for (const it of ideas){ const c = it.content||''; const sc = scoreText(c); if(sc>0){ ideaHits.push(`- ${center(c).slice(0,700)}`); if(ideaHits.length>=4) break; } }
	const plLines = (plotlines||[]).slice(0,5).map(pl=>`- ${pl.name}${pl.description? ': '+String(pl.description).slice(0,120):''}`);
	aiCtxStatus && (aiCtxStatus.textContent = `Contesto: ${sceneLines.length} scene, ${ideaHits.length} idee`);
	return [ plLines.length? 'Linee narrative:': null, ...plLines, sceneLines.length? 'Scene correlate:': null, ...sceneLines, ideaHits.length? 'Idee correlate:': null, ...ideaHits ].filter(Boolean).join('\n');
}

function applyAI(){
	const raw = aiOut.textContent||'';
	const fixed = repairJson(raw);
	let obj; try { obj = JSON.parse(fixed); } catch { toast.error('JSON IA non valido'); return; }
	if (obj.name) nameInput.value = obj.name;
	if (obj.description) descriptionInput.value = obj.description;
	if (obj.history) historyInput.value = obj.history;
	if (obj.role) roleInput.value = obj.role;
}
