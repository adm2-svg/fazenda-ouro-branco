// ==================================================================
// Fazenda Ouro Branco — confinamento de gado
// Mesmo banco (Supabase) do Sistema Gefoscal. Financeiro e Compras
// não têm tabela própria aqui: lêem direto de lancamento_financeiro
// (filtrado por centro de custo) e solicitacao_compra (filtrado por
// empresa) — a mesma fonte dos dois lados, sem duplicar e sem
// desincronizar. Lotes/Movimentações/Pesagens/Trato/Sanidade/
// Receitas/Notas Fiscais são exclusivos daqui.
// ==================================================================
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = 'https://dudouxbuhqjvkhhkdtas.supabase.co'
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR1ZG91eGJ1aHFqdmtoaGtkdGFzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY0NzcwODQsImV4cCI6MjEwMjA1MzA4NH0.Nzi9YwCpxhHyrCUWGSJGw1iX0Y4hgOSyu8OP3hP0JCU'
const db = createClient(SUPABASE_URL, SUPABASE_KEY)

// IDs fixos desse projeto — únicos, gravados quando a Fazenda Ouro
// Branco foi cadastrada como empresa/centro de custo no Gefoscal
const FAZENDA_EMPRESA_ID = '51c7d205-e304-45fc-9892-6c73ae03309a'
const FAZENDA_CENTRO_CUSTO_ID = '603b6a68-79c1-4e43-9bb1-dc0ea2396d10'

const $ = s => document.querySelector(s)
const esc = v => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const fmtNum = (n, d = 2) => (n ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d })
const fmtData = v => v ? new Date(v + (String(v).length === 10 ? 'T00:00:00' : '')).toLocaleDateString('pt-BR') : '—'
const fmtQuando = v => v ? new Date(v).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—'
const hojeISO = () => new Date().toISOString().slice(0, 10)
function numeroBR (raw) {
  if (raw === null || raw === undefined || raw === '') return null
  const limpo = String(raw).trim().replace(/\./g, '').replace(',', '.')
  const n = Number(limpo)
  return Number.isNaN(n) ? null : n
}

// ----- arquivo (mesmo bucket privado "documentos" do sistema principal) -----
async function enviarArquivo (arquivo, pasta) {
  if (!arquivo) return null
  const limpo = arquivo.name.replace(/[^\w.\-]/g, '_').slice(-80)
  const caminho = `${pasta}/${Date.now()}_${limpo}`
  const { error } = await db.storage.from('documentos').upload(caminho, arquivo, { upsert: false })
  if (error) throw new Error('Não deu para enviar o arquivo: ' + error.message)
  return { caminho, nome: arquivo.name }
}
async function abrirArquivo (caminho) {
  if (!caminho) return
  const { data, error } = await db.storage.from('documentos').createSignedUrl(caminho, 300)
  if (error) { alert('Não deu para abrir: ' + error.message); return }
  window.open(data.signedUrl, '_blank', 'noopener')
}

function kpi (rot, val, classe = '') {
  return `<div class="bloco ${classe}"><div class="rot">${esc(rot)}</div><div class="val">${val}</div></div>`
}

// ==================================================================
// LOGIN
// ==================================================================
$('#lg-entrar').onclick = async () => {
  const email = $('#lg-email').value.trim().toLowerCase()
  const senha = $('#lg-senha').value
  const btn = $('#lg-entrar')
  const erro = $('#lg-erro')
  erro.classList.add('oculto')
  if (!email || !senha) { erro.textContent = 'Preencha e-mail e senha.'; erro.classList.remove('oculto'); return }
  btn.disabled = true; btn.textContent = 'Entrando...'
  const { error } = await db.auth.signInWithPassword({ email, password: senha })
  btn.disabled = false; btn.textContent = 'Entrar'
  if (error) {
    erro.textContent = /invalid login/i.test(error.message) ? 'E-mail ou senha incorretos.' : error.message
    erro.classList.remove('oculto')
    return
  }
  await abrirApp()
}
$('#lg-senha').addEventListener('keydown', e => { if (e.key === 'Enter') $('#lg-entrar').click() })
$('#btn-sair').onclick = async () => { await db.auth.signOut(); location.reload() }

// ==================================================================
// SESSÃO E PERMISSÃO
// ==================================================================
let PERFIL = { userId: '', email: '', nome: '', pessoaId: null, papeis: [], editavel: false }

async function abrirApp () {
  const { data: { user } } = await db.auth.getUser()
  if (!user) return
  PERFIL.userId = user.id
  PERFIL.email = user.email

  const [{ data: papeis }, { data: perfil }] = await Promise.all([
    db.from('usuario_papel').select('papel').eq('user_id', user.id),
    db.from('usuario_perfil').select('pessoa_id,ativo,pessoa:pessoa_id(nome)').eq('user_id', user.id).maybeSingle()
  ])
  PERFIL.papeis = (papeis || []).map(p => p.papel)
  PERFIL.pessoaId = perfil?.pessoa_id ?? null
  PERFIL.nome = perfil?.pessoa?.nome || user.email

  if (!PERFIL.papeis.length || perfil?.ativo === false) {
    document.getElementById('lg-erro').textContent = 'Seu usuário ainda não tem acesso liberado. Fale com o administrador.'
    document.getElementById('lg-erro').classList.remove('oculto')
    await db.auth.signOut()
    return
  }

  const ehAdmin = PERFIL.papeis.includes('ADMIN') || PERFIL.papeis.includes('DIRETORIA')
  let temAcesso = ehAdmin
  let podeEditar = ehAdmin
  if (!ehAdmin && PERFIL.pessoaId) {
    const { data: modulo } = await db.from('modulo').select('id').eq('chave', 'fazenda').maybeSingle()
    if (modulo) {
      const { data: perm } = await db.from('modulo_permissao').select('pode_editar')
        .eq('pessoa_id', PERFIL.pessoaId).eq('modulo_id', modulo.id).maybeSingle()
      if (perm) { temAcesso = true; podeEditar = !!perm.pode_editar }
    }
  }
  if (!temAcesso) {
    document.getElementById('lg-erro').textContent = 'Seu usuário não tem acesso à Fazenda Ouro Branco. Fale com o administrador do Gefoscal pra liberar o módulo "Fazenda".'
    document.getElementById('lg-erro').classList.remove('oculto')
    await db.auth.signOut()
    return
  }
  PERFIL.editavel = podeEditar

  document.getElementById('tela-login').classList.add('oculto')
  document.getElementById('app').classList.remove('oculto')
  montarMenu()
  irPara('visao_geral')
}

// checa sessão existente ao carregar
db.auth.getSession().then(({ data: { session } }) => { if (session) abrirApp() })

// ==================================================================
// MENU / ROTEAMENTO
// ==================================================================
const ICONES = {
  visao_geral: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11.5L12 4l9 7.5"/><path d="M5 10v9a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1v-9"/></svg>',
  lotes: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9a8 5 0 0 1 16 0"/><path d="M4 9v6a8 5 0 0 0 16 0V9"/><path d="M4 15a8 5 0 0 0 16 0"/></svg>',
  financeiro: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>',
  compras: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>',
  notas: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="13" y2="17"/></svg>'
}
const PAGINAS = {
  visao_geral: { nome: 'Visão geral', render: paginaVisaoGeral },
  lotes: { nome: 'Lotes', render: paginaLotes },
  financeiro: { nome: 'Financeiro', render: paginaFinanceiro },
  compras: { nome: 'Compras', render: paginaCompras },
  notas: { nome: 'Notas fiscais', render: paginaNotasFiscais }
}
function montarMenu () {
  $('#menu').innerHTML = Object.entries(PAGINAS).map(([chave, p]) =>
    `<a data-chave="${chave}">${ICONES[chave]}<span>${esc(p.nome)}</span></a>`).join('')
  $('#menu').querySelectorAll('a').forEach(a => { a.onclick = () => irPara(a.dataset.chave) })
}
function irPara (chave) {
  const p = PAGINAS[chave]
  if (!p) return
  $('#menu').querySelectorAll('a').forEach(a => a.classList.toggle('ativo', a.dataset.chave === chave))
  $('#titulo-pagina').textContent = p.nome
  $('#subtitulo-pagina').textContent = ''
  $('#area').innerHTML = ''
  p.render()
}

// ==================================================================
// VISÃO GERAL
// ==================================================================
async function paginaVisaoGeral () {
  $('#subtitulo-pagina').textContent = `Olá, ${PERFIL.nome.split(' ')[0]}`
  const area = $('#area')
  area.innerHTML = `<p class="texto-dim2">carregando...</p>`

  const hoje = hojeISO()
  const [{ data: lotes }, { data: financeiro }, { data: receitas }, { data: pesagens }, { data: sanidade }] = await Promise.all([
    db.from('fazenda_lote').select('id,nome,status,qtde_inicial'),
    db.from('lancamento_financeiro').select('tipo,valor,situacao,data_lancamento').eq('centro_custo_id', FAZENDA_CENTRO_CUSTO_ID),
    db.from('fazenda_receita').select('valor_liquido'),
    db.from('fazenda_pesagem').select('lote_id,peso_medio,data').order('data', { ascending: false }),
    db.from('fazenda_sanidade').select('id,produto,proxima_aplicacao,lote:lote_id(nome)').not('proxima_aplicacao', 'is', null)
  ])

  const despesas = (financeiro || []).filter(f => f.tipo === 'SAIDA').reduce((s, f) => s + Number(f.valor || 0), 0)
  const receitasFin = (financeiro || []).filter(f => f.tipo === 'ENTRADA').reduce((s, f) => s + Number(f.valor || 0), 0)
  const receitasOper = (receitas || []).reduce((s, r) => s + Number(r.valor_liquido || 0), 0)
  const totalReceitas = receitasFin || receitasOper
  const lotesAtivos = (lotes || []).filter(l => l.status === 'EM_CONFINAMENTO')
  const qtdeAnimais = lotesAtivos.reduce((s, l) => s + Number(l.qtde_inicial || 0), 0)

  const ultimasPorLote = {}
  ;(pesagens || []).forEach(p => { if (!ultimasPorLote[p.lote_id]) ultimasPorLote[p.lote_id] = p })
  const pesos = Object.values(ultimasPorLote).map(p => Number(p.peso_medio || 0)).filter(n => n > 0)
  const pesoMedio = pesos.length ? pesos.reduce((a, b) => a + b, 0) / pesos.length : 0

  // contas a pagar (financeiro pendente) + sanidade com próxima aplicação vencendo
  const pendentes = (financeiro || []).filter(f => f.tipo === 'SAIDA' && f.situacao !== 'EFETIVADO')
    .sort((a, b) => (a.data_lancamento || '') < (b.data_lancamento || '') ? -1 : 1)
  const vacinasProximas = (sanidade || []).filter(s => s.proxima_aplicacao && s.proxima_aplicacao <= new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10))
    .sort((a, b) => a.proxima_aplicacao < b.proxima_aplicacao ? -1 : 1)

  area.innerHTML = `
    <div class="resumo-topo">
      ${kpi('Despesas', 'R$ ' + fmtNum(despesas))}
      ${kpi('Receitas', 'R$ ' + fmtNum(totalReceitas))}
      ${kpi('Resultado', 'R$ ' + fmtNum(totalReceitas - despesas))}
      ${kpi('Animais em confinamento', fmtNum(qtdeAnimais, 0))}
      ${kpi('Lotes ativos', lotesAtivos.length)}
      ${kpi('Peso médio geral', fmtNum(pesoMedio, 1) + ' kg')}
    </div>

    ${(pendentes.length || vacinasProximas.length) ? `
    <div class="panel" style="padding:18px;margin-bottom:18px;">
      <div class="cabeca-secao"><h3 style="font-size:16px;">O que precisa de atenção</h3></div>
      ${pendentes.slice(0, 8).map(f => `<div class="passo">
        <span>💰 Conta a pagar${f.data_lancamento ? ' — venc. ' + fmtData(f.data_lancamento) : ''}</span>
        <span class="badge-alerta">R$ ${fmtNum(f.valor)}</span>
      </div>`).join('')}
      ${vacinasProximas.slice(0, 8).map(s => `<div class="passo">
        <span>💉 ${esc(s.produto)} — ${esc(s.lote?.nome ?? 'lote')}</span>
        <span class="${s.proxima_aplicacao < hoje ? 'badge-alerta' : 'chip'}">${fmtData(s.proxima_aplicacao)}</span>
      </div>`).join('')}
    </div>` : `<div class="panel" style="padding:18px;margin-bottom:18px;"><p class="texto-dim2" style="margin:0;">Nada pendente no momento — tudo em dia.</p></div>`}

    <div class="cabeca-secao"><h3 style="font-size:16px;">Lotes ativos</h3></div>
    <div class="panel" style="padding:0;"><div class="tabela-scroll">
      <table><thead><tr><th>Lote</th><th class="num">Qtde</th><th>Status</th><th></th></tr></thead><tbody>
        ${lotesAtivos.length ? lotesAtivos.map(l => `<tr><td>${esc(l.nome)}</td><td class="num">${fmtNum(l.qtde_inicial, 0)}</td><td><span class="badge-bom">ativo</span></td>
          <td><button class="btn-secundario mini" data-ir-lotes>ver lotes</button></td></tr>`).join('')
          : '<tr><td colspan="4" class="vazio">Nenhum lote em confinamento.</td></tr>'}
      </tbody></table>
    </div></div>`

  area.querySelectorAll('[data-ir-lotes]').forEach(b => { b.onclick = () => irPara('lotes') })
}

// ==================================================================
// LOTES  (lista + criar/editar + detalhe com sub-abas)
// ==================================================================
async function paginaLotes () {
  $('#subtitulo-pagina').textContent = 'Cada lote é um grupo de animais — dele saem pesagem, trato, sanidade e receita'
  const area = $('#area')
  area.innerHTML = `<p class="texto-dim2">carregando...</p>`

  const { data, error } = await db.from('fazenda_lote').select('*').order('data_entrada', { ascending: false })
  if (error) { area.innerHTML = `<p class="vazio">${esc(error.message)}</p>`; return }
  const lotes = data || []

  area.innerHTML = `
    ${PERFIL.editavel ? `<div class="acoes" style="margin-bottom:16px;"><button class="btn" id="lt-novo">+ Novo lote</button></div>` : ''}
    <div class="panel" style="padding:0;"><div class="tabela-scroll">
      <table><thead><tr>
        <th>Lote</th><th>Pasto</th><th>Entrada</th><th class="num">Qtde</th><th class="num">Peso entrada</th>
        <th class="num">Custo inicial</th><th>Status</th><th></th>
      </tr></thead><tbody>
        ${lotes.map(l => `<tr>
          <td><b>${esc(l.nome)}</b></td>
          <td class="texto-dim">${esc(l.pasto ?? '—')}</td>
          <td class="texto-dim2">${fmtData(l.data_entrada)}</td>
          <td class="num">${fmtNum(l.qtde_inicial, 0)}</td>
          <td class="num">${l.peso_medio_entrada ? fmtNum(l.peso_medio_entrada, 1) + ' kg' : '—'}</td>
          <td class="num">R$ ${fmtNum(l.custo_total_inicial)}</td>
          <td>${l.status === 'EM_CONFINAMENTO' ? '<span class="badge-bom">em confinamento</span>' : `<span class="chip">${esc(l.status)}</span>`}</td>
          <td><button class="btn-secundario mini" data-detalhe="${l.id}">detalhar</button></td>
        </tr>`).join('') || `<tr><td colspan="8" class="vazio">Nenhum lote cadastrado ainda.</td></tr>`}
      </tbody></table>
    </div></div>`

  if (PERFIL.editavel) $('#lt-novo').onclick = () => formLote(null, () => paginaLotes())
  area.querySelectorAll('[data-detalhe]').forEach(b => { b.onclick = () => paginaLoteDetalhe(b.dataset.detalhe) })
}

function formLote (l, aoSalvar) {
  const fundo = document.createElement('div')
  fundo.className = 'modal-fundo'
  fundo.innerHTML = `<div class="modal">
    <h3>${l ? 'Editar lote' : 'Novo lote'}</h3>
    <div class="form-grade">
      <div class="campo" style="grid-column:1/-1;"><label>Nome do lote *</label><input id="fl-nome" value="${esc(l?.nome ?? '')}" placeholder="ex: Lote 01 - Nelore"></div>
      <div class="campo"><label>Pasto</label><input id="fl-pasto" value="${esc(l?.pasto ?? '')}" placeholder="ex: Pasto 08"></div>
      <div class="campo"><label>Data de entrada *</label><input type="date" id="fl-data" value="${l?.data_entrada ?? hojeISO()}"></div>
      <div class="campo"><label>Fornecedor</label><input id="fl-fornecedor" value="${esc(l?.fornecedor ?? '')}"></div>
      <div class="campo"><label>Origem</label><input id="fl-origem" value="${esc(l?.origem ?? '')}"></div>
      <div class="campo"><label>Quantidade inicial *</label><input id="fl-qtde" inputmode="decimal" value="${l?.qtde_inicial ?? ''}"></div>
      <div class="campo"><label>Peso médio entrada (kg)</label><input id="fl-peso" inputmode="decimal" value="${l?.peso_medio_entrada ?? ''}"></div>
      <div class="campo"><label>Valor da compra (R$)</label><input id="fl-valor" inputmode="decimal" value="${l?.valor_compra ?? ''}"></div>
      <div class="campo"><label>Frete (R$)</label><input id="fl-frete" inputmode="decimal" value="${l?.frete ?? ''}"></div>
      <div class="campo"><label>Outros custos (R$)</label><input id="fl-outros" inputmode="decimal" value="${l?.outros_custos ?? ''}"></div>
      <div class="campo"><label>Status</label><select id="fl-status">
        <option value="EM_CONFINAMENTO" ${(!l || l.status === 'EM_CONFINAMENTO') ? 'selected' : ''}>Em confinamento</option>
        <option value="VENDIDO" ${l?.status === 'VENDIDO' ? 'selected' : ''}>Vendido</option>
        <option value="ENCERRADO" ${l?.status === 'ENCERRADO' ? 'selected' : ''}>Encerrado</option>
      </select></div>
    </div>
    <div class="campo" style="margin-top:10px;"><label>Observações</label><textarea id="fl-obs" style="min-height:64px;">${esc(l?.observacoes ?? '')}</textarea></div>
    <div class="acoes" style="margin-top:14px;"><button class="btn" id="fl-salvar">Salvar</button>
      <button class="btn-secundario" id="fl-fechar">Fechar</button></div>
    <div class="recado oculto" id="fl-recado"></div>
  </div>`
  document.body.appendChild(fundo)
  const fechar = () => fundo.remove()
  fundo.querySelector('#fl-fechar').onclick = fechar
  fundo.onclick = e => { if (e.target === fundo) fechar() }

  fundo.querySelector('#fl-salvar').onclick = async () => {
    const el = fundo.querySelector('#fl-recado')
    const aviso = t => { el.textContent = t; el.classList.remove('oculto'); el.style.borderColor = 'var(--warn-text)'; el.style.color = 'var(--warn-text)' }
    const nome = fundo.querySelector('#fl-nome').value.trim()
    const qtde = numeroBR(fundo.querySelector('#fl-qtde').value)
    if (!nome) { aviso('Escreva o nome do lote.'); return }
    if (qtde === null || qtde <= 0) { aviso('Informe a quantidade inicial.'); return }
    const btn = fundo.querySelector('#fl-salvar'); btn.disabled = true; btn.textContent = 'Salvando...'
    const corpo = {
      nome, pasto: fundo.querySelector('#fl-pasto').value.trim() || null,
      data_entrada: fundo.querySelector('#fl-data').value, fornecedor: fundo.querySelector('#fl-fornecedor').value.trim() || null,
      origem: fundo.querySelector('#fl-origem').value.trim() || null, qtde_inicial: qtde,
      peso_medio_entrada: numeroBR(fundo.querySelector('#fl-peso').value),
      valor_compra: numeroBR(fundo.querySelector('#fl-valor').value) || 0,
      frete: numeroBR(fundo.querySelector('#fl-frete').value) || 0,
      outros_custos: numeroBR(fundo.querySelector('#fl-outros').value) || 0,
      status: fundo.querySelector('#fl-status').value, observacoes: fundo.querySelector('#fl-obs').value.trim() || null
    }
    let error
    if (l) { ({ error } = await db.from('fazenda_lote').update(corpo).eq('id', l.id)) }
    else { ({ error } = await db.from('fazenda_lote').insert({ ...corpo, criado_por: PERFIL.pessoaId })) }
    btn.disabled = false; btn.textContent = 'Salvar'
    if (error) { aviso(error.message); return }
    fechar(); aoSalvar()
  }
}

// ----- Detalhe do lote: resumo + sub-abas -----
async function paginaLoteDetalhe (loteId) {
  $('#subtitulo-pagina').textContent = 'carregando...'
  const area = $('#area')
  area.innerHTML = `<p class="texto-dim2">carregando...</p>`

  const { data: lote, error } = await db.from('fazenda_lote').select('*').eq('id', loteId).single()
  if (error) { area.innerHTML = `<p class="vazio">${esc(error.message)}</p>`; return }
  $('#subtitulo-pagina').textContent = lote.pasto ? `Pasto: ${lote.pasto}` : 'Detalhe do lote'

  const [{ data: pesagens }, { data: trato }, { data: sanidade }, { data: receitas }] = await Promise.all([
    db.from('fazenda_pesagem').select('*').eq('lote_id', loteId).order('data', { ascending: false }),
    db.from('fazenda_trato').select('valor_total').eq('lote_id', loteId),
    db.from('fazenda_sanidade').select('valor_total').eq('lote_id', loteId),
    db.from('fazenda_receita').select('valor_liquido').eq('lote_id', loteId)
  ])
  const custoTrato = (trato || []).reduce((s, t) => s + Number(t.valor_total || 0), 0)
  const custoSanidade = (sanidade || []).reduce((s, sa) => s + Number(sa.valor_total || 0), 0)
  const totalReceita = (receitas || []).reduce((s, r) => s + Number(r.valor_liquido || 0), 0)
  const pesoAtual = pesagens?.length ? Number(pesagens[0].peso_medio || 0) : 0
  const ganho = pesoAtual && lote.peso_medio_entrada ? pesoAtual - Number(lote.peso_medio_entrada) : 0
  const dias = Math.max(0, Math.floor((new Date() - new Date(lote.data_entrada + 'T00:00:00')) / 864e5))
  const custoTotal = Number(lote.custo_total_inicial || 0) + custoTrato + custoSanidade

  area.innerHTML = `
    <div class="acoes" style="margin-bottom:14px;">
      <button class="btn-secundario mini" id="ld-voltar">← voltar pra lista</button>
      ${PERFIL.editavel ? `<button class="btn-secundario mini" id="ld-editar">Editar lote</button>` : ''}
    </div>
    <div class="resumo-topo">
      ${kpi('Dias em confinamento', dias)}
      ${kpi('Peso atual', pesoAtual ? fmtNum(pesoAtual, 1) + ' kg' : '—')}
      ${kpi('Ganho de peso', ganho ? fmtNum(ganho, 1) + ' kg' : '—')}
      ${kpi('Custo total', 'R$ ' + fmtNum(custoTotal))}
      ${kpi('Receita', 'R$ ' + fmtNum(totalReceita))}
      ${kpi('Resultado', 'R$ ' + fmtNum(totalReceita - custoTotal), totalReceita - custoTotal < 0 ? 'alerta' : '')}
    </div>
    <div class="subabas">
      ${[['movimentacoes', 'Movimentações'], ['pesagens', 'Pesagens'], ['trato', 'Trato'], ['sanidade', 'Sanidade'], ['receitas', 'Receitas'], ['notas', 'Notas fiscais']]
        .map((a, i) => `<button data-sub="${a[0]}" class="${i === 0 ? 'ativo' : ''}">${a[1]}</button>`).join('')}
    </div>
    <div id="sub-lote"></div>`

  $('#ld-voltar').onclick = () => irPara('lotes')
  if (PERFIL.editavel) $('#ld-editar').onclick = () => formLote(lote, () => paginaLoteDetalhe(loteId))
  area.querySelectorAll('.subabas button').forEach(b => {
    b.onclick = () => {
      area.querySelectorAll('.subabas button').forEach(x => x.classList.toggle('ativo', x === b))
      abrirSubLote(b.dataset.sub, loteId)
    }
  })
  abrirSubLote('movimentacoes', loteId)
}

function abrirSubLote (sub, loteId) {
  const alvo = $('#sub-lote')
  alvo.innerHTML = `<p class="texto-dim2">carregando...</p>`
  if (sub === 'movimentacoes') subMovimentacoes(alvo, loteId)
  if (sub === 'pesagens') subPesagens(alvo, loteId)
  if (sub === 'trato') subTrato(alvo, loteId)
  if (sub === 'sanidade') subSanidade(alvo, loteId)
  if (sub === 'receitas') subReceitas(alvo, loteId)
  if (sub === 'notas') subNotasLote(alvo, loteId)
}

// helper genérico: lista simples + botão novo, reaproveitado pelas sub-abas
function blocoListaSimples (titulo, botaoNovo, tabelaHtml) {
  return `
    <div class="cabeca-secao"><h3 style="font-size:15px;">${titulo}</h3>${botaoNovo}</div>
    <div class="panel" style="padding:0;"><div class="tabela-scroll">${tabelaHtml}</div></div>`
}

// ----- Movimentações -----
async function subMovimentacoes (alvo, loteId) {
  const { data } = await db.from('fazenda_movimentacao').select('*').eq('lote_id', loteId).order('data', { ascending: false })
  const lista = data || []
  alvo.innerHTML = blocoListaSimples('Movimentações',
    PERFIL.editavel ? `<button class="btn-secundario mini" id="mv-novo">+ nova</button>` : '',
    `<table><thead><tr><th>Data</th><th>Tipo</th><th class="num">Qtde</th><th class="num">Peso médio</th><th class="num">Valor</th><th>Destino</th>${PERFIL.editavel ? '<th></th>' : ''}</tr></thead><tbody>
      ${lista.map(m => `<tr><td class="texto-dim2">${fmtData(m.data)}</td><td><span class="chip">${esc(m.tipo_mov)}</span></td>
        <td class="num">${fmtNum(m.qtde, 0)}</td><td class="num">${m.peso_medio ? fmtNum(m.peso_medio, 1) : '—'}</td>
        <td class="num">${m.valor_total ? 'R$ ' + fmtNum(m.valor_total) : '—'}</td><td class="texto-dim">${esc(m.destino ?? '—')}</td>
        ${PERFIL.editavel ? `<td><button class="btn-secundario mini" data-editar="${m.id}">editar</button></td>` : ''}</tr>`).join('')
        || `<tr><td colspan="${PERFIL.editavel ? 7 : 6}" class="vazio">Nenhuma movimentação ainda.</td></tr>`}
    </tbody></table>`)
  if (PERFIL.editavel) {
    $('#mv-novo').onclick = () => formMovimentacao(loteId, null, () => subMovimentacoes(alvo, loteId))
    alvo.querySelectorAll('[data-editar]').forEach(b => {
      b.onclick = () => formMovimentacao(loteId, lista.find(x => x.id === b.dataset.editar), () => subMovimentacoes(alvo, loteId))
    })
  }
}
function formMovimentacao (loteId, registro, aoSalvar) {
  abrirFormRapido({
    titulo: registro ? 'Editar movimentação' : 'Nova movimentação',
    campos: [
      ['data', 'Data', 'date', hojeISO()], ['tipo_mov', 'Tipo', 'select', 'ENTRADA', ['ENTRADA', 'SAIDA', 'TRANSFERENCIA', 'MORTE']],
      ['qtde', 'Quantidade', 'decimal', ''], ['peso_medio', 'Peso médio (kg)', 'decimal', ''],
      ['valor_total', 'Valor total (R$)', 'decimal', ''], ['destino', 'Destino', 'text', ''], ['observacoes', 'Observações', 'textarea', '']
    ],
    obrigatorios: ['data', 'qtde'], registro,
    salvar: async corpo => registro
      ? db.from('fazenda_movimentacao').update(corpo).eq('id', registro.id)
      : db.from('fazenda_movimentacao').insert({ ...corpo, lote_id: loteId, criado_por: PERFIL.pessoaId }),
    excluir: async id => db.from('fazenda_movimentacao').delete().eq('id', id)
  }, aoSalvar)
}

// ----- Pesagens -----
async function subPesagens (alvo, loteId) {
  const { data } = await db.from('fazenda_pesagem').select('*').eq('lote_id', loteId).order('data', { ascending: false })
  const lista = data || []
  alvo.innerHTML = blocoListaSimples('Pesagens',
    PERFIL.editavel ? `<button class="btn-secundario mini" id="ps-novo">+ nova</button>` : '',
    `<table><thead><tr><th>Data</th><th class="num">Qtde pesada</th><th class="num">Peso médio</th><th class="num">Peso total</th><th>Obs</th>${PERFIL.editavel ? '<th></th>' : ''}</tr></thead><tbody>
      ${lista.map(p => `<tr><td class="texto-dim2">${fmtData(p.data)}</td><td class="num">${fmtNum(p.qtde_pesada, 0)}</td>
        <td class="num">${fmtNum(p.peso_medio, 1)} kg</td><td class="num">${fmtNum(p.peso_total, 1)} kg</td><td class="texto-dim">${esc(p.observacoes ?? '—')}</td>
        ${PERFIL.editavel ? `<td><button class="btn-secundario mini" data-editar="${p.id}">editar</button></td>` : ''}</tr>`).join('')
        || `<tr><td colspan="${PERFIL.editavel ? 6 : 5}" class="vazio">Nenhuma pesagem ainda.</td></tr>`}
    </tbody></table>`)
  if (PERFIL.editavel) {
    $('#ps-novo').onclick = () => formPesagem(loteId, null, () => subPesagens(alvo, loteId))
    alvo.querySelectorAll('[data-editar]').forEach(b => {
      b.onclick = () => formPesagem(loteId, lista.find(x => x.id === b.dataset.editar), () => subPesagens(alvo, loteId))
    })
  }
}
function formPesagem (loteId, registro, aoSalvar) {
  abrirFormRapido({
    titulo: registro ? 'Editar pesagem' : 'Nova pesagem',
    campos: [
      ['data', 'Data', 'date', hojeISO()], ['qtde_pesada', 'Quantidade pesada', 'decimal', ''],
      ['peso_medio', 'Peso médio (kg)', 'decimal', ''], ['observacoes', 'Observações', 'textarea', '']
    ],
    obrigatorios: ['data', 'qtde_pesada', 'peso_medio'], registro,
    salvar: async corpo => registro
      ? db.from('fazenda_pesagem').update(corpo).eq('id', registro.id)
      : db.from('fazenda_pesagem').insert({ ...corpo, lote_id: loteId, criado_por: PERFIL.pessoaId }),
    excluir: async id => db.from('fazenda_pesagem').delete().eq('id', id)
  }, aoSalvar)
}

// ----- Trato -----
async function subTrato (alvo, loteId) {
  const { data } = await db.from('fazenda_trato').select('*').eq('lote_id', loteId).order('data', { ascending: false })
  const lista = data || []
  const total = lista.reduce((s, t) => s + Number(t.valor_total || 0), 0)
  alvo.innerHTML = blocoListaSimples(`Trato — total R$ ${fmtNum(total)}`,
    PERFIL.editavel ? `<button class="btn-secundario mini" id="tr-novo">+ novo</button>` : '',
    `<table><thead><tr><th>Data</th><th>Insumo</th><th class="num">Qtde</th><th class="num">Unit.</th><th class="num">Total</th>${PERFIL.editavel ? '<th></th>' : ''}</tr></thead><tbody>
      ${lista.map(t => `<tr><td class="texto-dim2">${fmtData(t.data)}</td><td>${esc(t.insumo)}</td>
        <td class="num">${fmtNum(t.quantidade)} ${esc(t.unidade ?? '')}</td><td class="num">R$ ${fmtNum(t.valor_unitario)}</td><td class="num">R$ ${fmtNum(t.valor_total)}</td>
        ${PERFIL.editavel ? `<td><button class="btn-secundario mini" data-editar="${t.id}">editar</button></td>` : ''}</tr>`).join('')
        || `<tr><td colspan="${PERFIL.editavel ? 6 : 5}" class="vazio">Nenhum trato lançado ainda.</td></tr>`}
    </tbody></table>`)
  if (PERFIL.editavel) {
    $('#tr-novo').onclick = () => formTrato(loteId, null, () => subTrato(alvo, loteId))
    alvo.querySelectorAll('[data-editar]').forEach(b => {
      b.onclick = () => formTrato(loteId, lista.find(x => x.id === b.dataset.editar), () => subTrato(alvo, loteId))
    })
  }
}
function formTrato (loteId, registro, aoSalvar) {
  abrirFormRapido({
    titulo: registro ? 'Editar trato' : 'Novo trato',
    campos: [
      ['data', 'Data', 'date', hojeISO()], ['insumo', 'Insumo', 'text', ''], ['tipo_insumo', 'Tipo', 'text', ''],
      ['quantidade', 'Quantidade', 'decimal', ''], ['unidade', 'Unidade', 'text', 'kg'],
      ['valor_unitario', 'Valor unitário (R$)', 'decimal', ''], ['observacoes', 'Observações', 'textarea', '']
    ],
    obrigatorios: ['data', 'insumo', 'quantidade'], registro,
    salvar: async corpo => registro
      ? db.from('fazenda_trato').update(corpo).eq('id', registro.id)
      : db.from('fazenda_trato').insert({ ...corpo, lote_id: loteId, criado_por: PERFIL.pessoaId }),
    excluir: async id => db.from('fazenda_trato').delete().eq('id', id)
  }, aoSalvar)
}

// ----- Sanidade -----
async function subSanidade (alvo, loteId) {
  const { data } = await db.from('fazenda_sanidade').select('*').eq('lote_id', loteId).order('data', { ascending: false })
  const lista = data || []
  alvo.innerHTML = blocoListaSimples('Sanidade',
    PERFIL.editavel ? `<button class="btn-secundario mini" id="sa-novo">+ nova</button>` : '',
    `<table><thead><tr><th>Data</th><th>Produto</th><th class="num">Qtde animais</th><th class="num">Valor</th><th>Próxima aplicação</th>${PERFIL.editavel ? '<th></th>' : ''}</tr></thead><tbody>
      ${lista.map(s => `<tr><td class="texto-dim2">${fmtData(s.data)}</td><td>${esc(s.produto)}</td>
        <td class="num">${s.qtde_animais ? fmtNum(s.qtde_animais, 0) : '—'}</td><td class="num">R$ ${fmtNum(s.valor_total)}</td>
        <td class="texto-dim2">${s.proxima_aplicacao ? fmtData(s.proxima_aplicacao) : '—'}</td>
        ${PERFIL.editavel ? `<td><button class="btn-secundario mini" data-editar="${s.id}">editar</button></td>` : ''}</tr>`).join('')
        || `<tr><td colspan="${PERFIL.editavel ? 6 : 5}" class="vazio">Nenhum registro de sanidade ainda.</td></tr>`}
    </tbody></table>`)
  if (PERFIL.editavel) {
    $('#sa-novo').onclick = () => formSanidade(loteId, null, () => subSanidade(alvo, loteId))
    alvo.querySelectorAll('[data-editar]').forEach(b => {
      b.onclick = () => formSanidade(loteId, lista.find(x => x.id === b.dataset.editar), () => subSanidade(alvo, loteId))
    })
  }
}
function formSanidade (loteId, registro, aoSalvar) {
  abrirFormRapido({
    titulo: registro ? 'Editar registro de sanidade' : 'Novo registro de sanidade',
    campos: [
      ['data', 'Data', 'date', hojeISO()], ['tipo_sanidade', 'Tipo', 'text', ''], ['produto', 'Produto', 'text', ''],
      ['dosagem', 'Dosagem', 'decimal', ''], ['unidade', 'Unidade', 'text', ''], ['qtde_animais', 'Qtde de animais', 'decimal', ''],
      ['valor_total', 'Valor total (R$)', 'decimal', ''], ['proxima_aplicacao', 'Próxima aplicação', 'date', ''],
      ['responsavel', 'Responsável', 'text', ''], ['observacoes', 'Observações', 'textarea', '']
    ],
    obrigatorios: ['data', 'produto'], registro,
    salvar: async corpo => registro
      ? db.from('fazenda_sanidade').update(corpo).eq('id', registro.id)
      : db.from('fazenda_sanidade').insert({ ...corpo, lote_id: loteId, criado_por: PERFIL.pessoaId }),
    excluir: async id => db.from('fazenda_sanidade').delete().eq('id', id)
  }, aoSalvar)
}

// ----- Receitas -----
async function subReceitas (alvo, loteId) {
  const { data } = await db.from('fazenda_receita').select('*').eq('lote_id', loteId).order('data', { ascending: false })
  const lista = data || []
  alvo.innerHTML = blocoListaSimples('Receitas (vendas)',
    PERFIL.editavel ? `<button class="btn-secundario mini" id="rc-novo">+ nova</button>` : '',
    `<table><thead><tr><th>Data</th><th>Cliente</th><th class="num">Peso total</th><th class="num">@</th><th class="num">Valor líquido</th>${PERFIL.editavel ? '<th></th>' : ''}</tr></thead><tbody>
      ${lista.map(r => `<tr><td class="texto-dim2">${fmtData(r.data)}</td><td>${esc(r.cliente ?? '—')}</td>
        <td class="num">${fmtNum(r.peso_total, 1)} kg</td><td class="num">${fmtNum(r.arrobas, 2)}</td><td class="num">R$ ${fmtNum(r.valor_liquido)}</td>
        ${PERFIL.editavel ? `<td><button class="btn-secundario mini" data-editar="${r.id}">editar</button></td>` : ''}</tr>`).join('')
        || `<tr><td colspan="${PERFIL.editavel ? 6 : 5}" class="vazio">Nenhuma receita lançada ainda.</td></tr>`}
    </tbody></table>`)
  if (PERFIL.editavel) {
    $('#rc-novo').onclick = () => formReceita(loteId, null, () => subReceitas(alvo, loteId))
    alvo.querySelectorAll('[data-editar]').forEach(b => {
      b.onclick = () => formReceita(loteId, lista.find(x => x.id === b.dataset.editar), () => subReceitas(alvo, loteId))
    })
  }
}
function formReceita (loteId, registro, aoSalvar) {
  abrirFormRapido({
    titulo: registro ? 'Editar receita' : 'Nova receita',
    campos: [
      ['data', 'Data', 'date', hojeISO()], ['cliente', 'Cliente', 'text', ''], ['qtde', 'Quantidade', 'decimal', ''],
      ['peso_total', 'Peso total (kg)', 'decimal', ''], ['valor_bruto', 'Valor bruto (R$)', 'decimal', ''],
      ['descontos', 'Descontos (R$)', 'decimal', ''], ['forma_recebimento', 'Forma de recebimento', 'text', ''],
      ['observacoes', 'Observações', 'textarea', '']
    ],
    obrigatorios: ['data', 'peso_total'], registro,
    salvar: async corpo => registro
      ? db.from('fazenda_receita').update(corpo).eq('id', registro.id)
      : db.from('fazenda_receita').insert({ ...corpo, lote_id: loteId, criado_por: PERFIL.pessoaId }),
    excluir: async id => db.from('fazenda_receita').delete().eq('id', id)
  }, aoSalvar)
}

// ----- Notas fiscais do lote -----
async function subNotasLote (alvo, loteId) {
  const { data } = await db.from('fazenda_nota_fiscal').select('*').eq('lote_id', loteId).order('data', { ascending: false })
  const lista = data || []
  alvo.innerHTML = blocoListaSimples('Notas fiscais desse lote',
    PERFIL.editavel ? `<button class="btn-secundario mini" id="nf-novo">+ anexar</button>` : '',
    `<table><thead><tr><th>Data</th><th>Fornecedor/cliente</th><th>Nº NF</th><th class="num">Valor</th><th></th></tr></thead><tbody>
      ${lista.map(n => `<tr><td class="texto-dim2">${fmtData(n.data)}</td><td>${esc(n.fornecedor_cliente ?? '—')}</td>
        <td class="texto-dim">${esc(n.numero_nf ?? '—')}</td><td class="num">R$ ${fmtNum(n.valor)}</td>
        <td>${n.arquivo_url ? `<button class="btn-secundario mini" data-abrir-nf="${esc(n.arquivo_url)}">abrir</button>` : '—'}</td></tr>`).join('')
        || `<tr><td colspan="5" class="vazio">Nenhuma nota fiscal anexada ainda.</td></tr>`}
    </tbody></table>`)
  alvo.querySelectorAll('[data-abrir-nf]').forEach(b => { b.onclick = () => abrirArquivo(b.dataset.abrirNf) })
  if (PERFIL.editavel) $('#nf-novo').onclick = () => formNotaFiscal({ loteId }, () => subNotasLote(alvo, loteId))
}

// ==================================================================
// Formulário genérico — reaproveitado por Movimentações, Pesagens,
// Trato, Sanidade e Receitas, que têm a mesma cara (campos simples,
// salvar, fechar) e só mudam a lista de campos.
// ==================================================================
function abrirFormRapido ({ titulo, campos, obrigatorios, salvar, excluir, registro }, aoSalvar) {
  const fundo = document.createElement('div')
  fundo.className = 'modal-fundo'
  const valorDe = (chave, padrao) => (registro && registro[chave] !== undefined && registro[chave] !== null) ? registro[chave] : padrao
  const campoHtml = ([chave, label, tipo, padrao, opcoes]) => {
    const id = `fr-${chave}`
    const valor = valorDe(chave, padrao)
    if (tipo === 'select') return `<div class="campo"><label>${esc(label)}</label>
      <select id="${id}">${opcoes.map(o => `<option value="${esc(o)}" ${o === valor ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select></div>`
    if (tipo === 'textarea') return `<div class="campo" style="grid-column:1/-1;"><label>${esc(label)}</label><textarea id="${id}" style="min-height:64px;">${esc(valor ?? '')}</textarea></div>`
    if (tipo === 'date') return `<div class="campo"><label>${esc(label)}</label><input type="date" id="${id}" value="${esc(valor ?? '')}"></div>`
    if (tipo === 'decimal') return `<div class="campo"><label>${esc(label)}</label><input id="${id}" inputmode="decimal" value="${esc(valor ?? '')}"></div>`
    return `<div class="campo"><label>${esc(label)}</label><input id="${id}" value="${esc(valor ?? '')}"></div>`
  }
  fundo.innerHTML = `<div class="modal">
    <h3>${esc(titulo)}</h3>
    <div class="form-grade">${campos.map(campoHtml).join('')}</div>
    <div class="acoes" style="margin-top:14px;">
      <button class="btn" id="fr-salvar">Salvar</button>
      ${registro && excluir ? `<button class="btn-secundario" id="fr-excluir" style="color:var(--warn-text);">Excluir</button>` : ''}
      <button class="btn-secundario" id="fr-fechar">Fechar</button>
    </div>
    <div class="recado oculto" id="fr-recado"></div>
  </div>`
  document.body.appendChild(fundo)
  const fechar = () => fundo.remove()
  fundo.querySelector('#fr-fechar').onclick = fechar
  fundo.onclick = e => { if (e.target === fundo) fechar() }
  const el = fundo.querySelector('#fr-recado')
  const aviso = t => { el.textContent = t; el.classList.remove('oculto'); el.style.borderColor = 'var(--warn-text)'; el.style.color = 'var(--warn-text)' }

  if (registro && excluir) {
    fundo.querySelector('#fr-excluir').onclick = async () => {
      if (!confirm('Excluir esse registro? Não dá pra desfazer.')) return
      const btn = fundo.querySelector('#fr-excluir'); btn.disabled = true; btn.textContent = 'Excluindo...'
      const { error } = await excluir(registro.id)
      if (error) { btn.disabled = false; btn.textContent = 'Excluir'; aviso(error.message); return }
      fechar(); aoSalvar()
    }
  }

  fundo.querySelector('#fr-salvar').onclick = async () => {
    const corpo = {}
    for (const [chave, label, tipo] of campos) {
      const raw = fundo.querySelector(`#fr-${chave}`).value
      if (tipo === 'decimal') corpo[chave] = raw.trim() ? numeroBR(raw) : null
      else corpo[chave] = raw.trim ? raw.trim() || null : raw
    }
    for (const ob of (obrigatorios || [])) {
      if (corpo[ob] === null || corpo[ob] === undefined || corpo[ob] === '') { aviso(`Preencha o campo obrigatório.`); return }
    }
    const btn = fundo.querySelector('#fr-salvar'); btn.disabled = true; btn.textContent = 'Salvando...'
    const { error } = await salvar(corpo)
    btn.disabled = false; btn.textContent = 'Salvar'
    if (error) { aviso(error.message); return }
    fechar(); aoSalvar()
  }
}

// ==================================================================
// NOTAS FISCAIS  (visão geral — todas, não só de um lote)
// ==================================================================
async function paginaNotasFiscais () {
  $('#subtitulo-pagina').textContent = 'Notas fiscais de entrada e saída da fazenda'
  const area = $('#area')
  area.innerHTML = `<p class="texto-dim2">carregando...</p>`

  const [{ data: notas }, { data: lotes }] = await Promise.all([
    db.from('fazenda_nota_fiscal').select('*, lote:lote_id(nome)').order('data', { ascending: false }).limit(300),
    db.from('fazenda_lote').select('id,nome').order('nome')
  ])
  window.__FAZENDA_LOTES = lotes || []

  area.innerHTML = `
    ${PERFIL.editavel ? `<div class="acoes" style="margin-bottom:16px;"><button class="btn" id="nfp-novo">+ Anexar nota fiscal</button></div>` : ''}
    <div class="panel" style="padding:0;"><div class="tabela-scroll">
      <table><thead><tr><th>Data</th><th>Tipo</th><th>Fornecedor/cliente</th><th>Nº NF</th><th>Lote</th><th class="num">Valor</th><th></th></tr></thead><tbody>
        ${(notas || []).map(n => `<tr>
          <td class="texto-dim2">${fmtData(n.data)}</td>
          <td><span class="chip">${n.tipo === 'SAIDA' ? 'Saída' : 'Entrada'}</span></td>
          <td>${esc(n.fornecedor_cliente ?? '—')}</td><td class="texto-dim">${esc(n.numero_nf ?? '—')}</td>
          <td class="texto-dim2">${esc(n.lote?.nome ?? '—')}</td><td class="num">R$ ${fmtNum(n.valor)}</td>
          <td>${n.arquivo_url ? `<button class="btn-secundario mini" data-abrir-nf="${esc(n.arquivo_url)}">abrir</button>` : '—'}</td>
        </tr>`).join('') || `<tr><td colspan="7" class="vazio">Nenhuma nota fiscal anexada ainda.</td></tr>`}
      </tbody></table>
    </div></div>`

  area.querySelectorAll('[data-abrir-nf]').forEach(b => { b.onclick = () => abrirArquivo(b.dataset.abrirNf) })
  if (PERFIL.editavel) $('#nfp-novo').onclick = () => formNotaFiscal({}, () => paginaNotasFiscais())
}

function formNotaFiscal (preset, aoSalvar) {
  const lotes = window.__FAZENDA_LOTES || []
  const fundo = document.createElement('div')
  fundo.className = 'modal-fundo'
  fundo.innerHTML = `<div class="modal">
    <h3>Anexar nota fiscal</h3>
    <div class="form-grade">
      <div class="campo"><label>Data *</label><input type="date" id="nf-data" value="${hojeISO()}"></div>
      <div class="campo"><label>Tipo</label><select id="nf-tipo"><option value="ENTRADA">Entrada</option><option value="SAIDA">Saída</option></select></div>
      <div class="campo"><label>Fornecedor/cliente</label><input id="nf-fc"></div>
      <div class="campo"><label>Nº da NF</label><input id="nf-num"></div>
      <div class="campo"><label>Valor (R$)</label><input id="nf-valor" inputmode="decimal"></div>
      <div class="campo"><label>Lote (opcional)</label><select id="nf-lote"><option value="">—</option>
        ${lotes.map(l => `<option value="${l.id}" ${l.id === preset.loteId ? 'selected' : ''}>${esc(l.nome)}</option>`).join('')}</select></div>
    </div>
    <div class="campo" style="margin-top:10px;"><label>Arquivo (PDF ou imagem) *</label>
      <input type="file" id="nf-arquivo" accept=".pdf,.jpg,.jpeg,.png,.xml"></div>
    <div class="campo" style="margin-top:10px;"><label>Observações</label><textarea id="nf-obs" style="min-height:60px;"></textarea></div>
    <div class="acoes" style="margin-top:14px;"><button class="btn" id="nf-salvar">Salvar</button>
      <button class="btn-secundario" id="nf-fechar">Fechar</button></div>
    <div class="recado oculto" id="nf-recado"></div>
  </div>`
  document.body.appendChild(fundo)
  const fechar = () => fundo.remove()
  fundo.querySelector('#nf-fechar').onclick = fechar
  fundo.onclick = e => { if (e.target === fundo) fechar() }

  fundo.querySelector('#nf-salvar').onclick = async () => {
    const el = fundo.querySelector('#nf-recado')
    const aviso = t => { el.textContent = t; el.classList.remove('oculto'); el.style.borderColor = 'var(--warn-text)'; el.style.color = 'var(--warn-text)' }
    const arquivo = fundo.querySelector('#nf-arquivo').files[0]
    if (!arquivo) { aviso('Selecione o arquivo da nota fiscal.'); return }
    const btn = fundo.querySelector('#nf-salvar'); btn.disabled = true; btn.textContent = 'Enviando...'
    try {
      const enviado = await enviarArquivo(arquivo, 'fazenda-nf')
      const { data: signed } = await db.storage.from('documentos').createSignedUrl(enviado.caminho, 60 * 60 * 24 * 365)
      const { error } = await db.from('fazenda_nota_fiscal').insert({
        data: fundo.querySelector('#nf-data').value, tipo: fundo.querySelector('#nf-tipo').value,
        fornecedor_cliente: fundo.querySelector('#nf-fc').value.trim() || null,
        numero_nf: fundo.querySelector('#nf-num').value.trim() || null,
        valor: numeroBR(fundo.querySelector('#nf-valor').value) || 0,
        lote_id: fundo.querySelector('#nf-lote').value || null,
        arquivo_url: enviado.caminho, nome_arquivo: enviado.nome,
        observacoes: fundo.querySelector('#nf-obs').value.trim() || null, criado_por: PERFIL.pessoaId
      })
      btn.disabled = false; btn.textContent = 'Salvar'
      if (error) { aviso(error.message); return }
      fechar(); aoSalvar()
    } catch (e) {
      btn.disabled = false; btn.textContent = 'Salvar'
      aviso(e.message)
    }
  }
}

// ==================================================================
// FINANCEIRO  (lê lancamento_financeiro filtrado por centro de custo
// Fazenda Ouro Branco — mesma tabela do Gefoscal, nunca mistura)
// ==================================================================
async function paginaFinanceiro () {
  $('#subtitulo-pagina').textContent = 'Lançamentos da fazenda — mesma base do Gefoscal, filtrada só pra cá'
  const area = $('#area')
  area.innerHTML = `<p class="texto-dim2">carregando...</p>`

  const [{ data: lancs }, { data: contas }, { data: categorias }] = await Promise.all([
    db.from('lancamento_financeiro').select('*, conta:conta_id(nome), categoria:categoria_id(nome)')
      .eq('centro_custo_id', FAZENDA_CENTRO_CUSTO_ID).order('data_lancamento', { ascending: false }).limit(300),
    db.from('conta_financeira').select('id,nome').order('nome'),
    db.from('categoria_financeira').select('id,nome').order('nome')
  ])
  window.__FAZENDA_CONTAS = contas || []
  window.__FAZENDA_CATEGORIAS = categorias || []
  const lista = lancs || []
  const despesas = lista.filter(l => l.tipo === 'SAIDA').reduce((s, l) => s + Number(l.valor || 0), 0)
  const receitas = lista.filter(l => l.tipo === 'ENTRADA').reduce((s, l) => s + Number(l.valor || 0), 0)

  area.innerHTML = `
    <div class="resumo-topo">
      ${kpi('Despesas', 'R$ ' + fmtNum(despesas))}
      ${kpi('Receitas', 'R$ ' + fmtNum(receitas))}
      ${kpi('Resultado', 'R$ ' + fmtNum(receitas - despesas))}
    </div>
    ${PERFIL.editavel ? `<div class="acoes" style="margin-bottom:16px;"><button class="btn" id="fin-novo">+ Novo lançamento</button></div>` : ''}
    <div class="panel" style="padding:0;"><div class="tabela-scroll">
      <table><thead><tr><th>Data</th><th>Tipo</th><th>Categoria</th><th>Conta</th><th>Descrição</th><th class="num">Valor</th><th>Situação</th></tr></thead><tbody>
        ${lista.map(l => `<tr>
          <td class="texto-dim2">${fmtData(l.data_lancamento)}</td>
          <td>${l.tipo === 'SAIDA' ? '<span class="badge-alerta">Saída</span>' : '<span class="badge-bom">Entrada</span>'}</td>
          <td class="texto-dim2">${esc(l.categoria?.nome ?? '—')}</td><td class="texto-dim2">${esc(l.conta?.nome ?? '—')}</td>
          <td>${esc(l.descricao ?? '—')}</td><td class="num">R$ ${fmtNum(l.valor)}</td>
          <td>${l.situacao === 'EFETIVADO' ? '<span class="badge-bom">efetivado</span>' : '<span class="chip">pendente</span>'}</td>
        </tr>`).join('') || `<tr><td colspan="7" class="vazio">Nenhum lançamento ainda.</td></tr>`}
      </tbody></table>
    </div></div>`

  if (PERFIL.editavel) $('#fin-novo').onclick = () => formLancamento(() => paginaFinanceiro())
}

function formLancamento (aoSalvar) {
  const contas = window.__FAZENDA_CONTAS || []
  const categorias = window.__FAZENDA_CATEGORIAS || []
  const fundo = document.createElement('div')
  fundo.className = 'modal-fundo'
  fundo.innerHTML = `<div class="modal">
    <h3>Novo lançamento financeiro</h3>
    <div class="form-grade">
      <div class="campo"><label>Data *</label><input type="date" id="fn-data" value="${hojeISO()}"></div>
      <div class="campo"><label>Tipo</label><select id="fn-tipo"><option value="SAIDA">Saída (despesa)</option><option value="ENTRADA">Entrada (receita)</option></select></div>
      <div class="campo"><label>Categoria</label><select id="fn-categoria"><option value="">—</option>${categorias.map(c => `<option value="${c.id}">${esc(c.nome)}</option>`).join('')}</select></div>
      <div class="campo"><label>Conta</label><select id="fn-conta"><option value="">—</option>${contas.map(c => `<option value="${c.id}">${esc(c.nome)}</option>`).join('')}</select></div>
      <div class="campo"><label>Valor (R$) *</label><input id="fn-valor" inputmode="decimal"></div>
      <div class="campo"><label>Situação</label><select id="fn-situacao"><option value="PLANEJADO">Pendente</option><option value="EFETIVADO">Efetivado</option></select></div>
    </div>
    <div class="campo" style="margin-top:10px;"><label>Descrição *</label><input id="fn-descricao"></div>
    <div class="campo" style="margin-top:10px;"><label>Observação</label><textarea id="fn-obs" style="min-height:60px;"></textarea></div>
    <div class="acoes" style="margin-top:14px;"><button class="btn" id="fn-salvar">Salvar</button>
      <button class="btn-secundario" id="fn-fechar">Fechar</button></div>
    <div class="recado oculto" id="fn-recado"></div>
  </div>`
  document.body.appendChild(fundo)
  const fechar = () => fundo.remove()
  fundo.querySelector('#fn-fechar').onclick = fechar
  fundo.onclick = e => { if (e.target === fundo) fechar() }

  fundo.querySelector('#fn-salvar').onclick = async () => {
    const el = fundo.querySelector('#fn-recado')
    const aviso = t => { el.textContent = t; el.classList.remove('oculto'); el.style.borderColor = 'var(--warn-text)'; el.style.color = 'var(--warn-text)' }
    const descricao = fundo.querySelector('#fn-descricao').value.trim()
    const valor = numeroBR(fundo.querySelector('#fn-valor').value)
    if (!descricao) { aviso('Escreva a descrição.'); return }
    if (valor === null || valor <= 0) { aviso('Informe o valor.'); return }
    const btn = fundo.querySelector('#fn-salvar'); btn.disabled = true; btn.textContent = 'Salvando...'
    const { error } = await db.from('lancamento_financeiro').insert({
      data_lancamento: fundo.querySelector('#fn-data').value, tipo: fundo.querySelector('#fn-tipo').value,
      categoria_id: fundo.querySelector('#fn-categoria').value || null, conta_id: fundo.querySelector('#fn-conta').value || null,
      centro_custo_id: FAZENDA_CENTRO_CUSTO_ID, valor, situacao: fundo.querySelector('#fn-situacao').value,
      descricao, observacao: fundo.querySelector('#fn-obs').value.trim() || null, registrado_por: PERFIL.pessoaId
    })
    btn.disabled = false; btn.textContent = 'Salvar'
    if (error) { aviso(error.message); return }
    fechar(); aoSalvar()
  }
}

// ==================================================================
// COMPRAS  (lê solicitacao_compra filtrado por empresa Fazenda Ouro
// Branco — pedir aqui bate lá no Gefoscal, e vice-versa, porque é a
// mesma linha da mesma tabela)
// ==================================================================
async function paginaCompras () {
  $('#subtitulo-pagina').textContent = 'Solicitações de compra — sincronizadas com o Compras do Gefoscal'
  const area = $('#area')
  area.innerHTML = `<p class="texto-dim2">carregando...</p>`

  const { data: solic, error } = await db.from('solicitacao_compra').select('*')
    .eq('empresa_id', FAZENDA_EMPRESA_ID).order('criado_em', { ascending: false }).limit(300)
  if (error) { area.innerHTML = `<p class="vazio">${esc(error.message)}</p>`; return }
  const lista = solic || []

  const ROTULO_STATUS = {
    AGUARDANDO_COORD: 'Aguardando coordenação', AGUARDANDO_COTACAO: 'Em cotação', AGUARDANDO_APROVACAO: 'Aguardando aprovação',
    APROVADA: 'Aprovada', REPROVADA: 'Reprovada', PAGA: 'Paga', RECEBIDA: 'Recebida', CANCELADA: 'Cancelada'
  }
  const corStatus = s => ['APROVADA', 'RECEBIDA', 'PAGA'].includes(s) ? 'badge-bom' : ['REPROVADA', 'CANCELADA'].includes(s) ? 'badge-alerta' : 'chip'

  area.innerHTML = `
    <div class="acoes" style="margin-bottom:16px;"><button class="btn" id="cp-novo">+ Nova solicitação de compra</button></div>
    <div class="panel" style="padding:0;"><div class="tabela-scroll">
      <table><thead><tr><th>Quando</th><th>Produto/serviço</th><th class="num">Qtde</th><th>Status</th><th class="num">Valor estimado</th></tr></thead><tbody>
        ${lista.map(s => `<tr>
          <td class="texto-dim2">${fmtQuando(s.criado_em)}</td>
          <td>${esc(s.produto_servico)}</td>
          <td class="num">${s.quantidade ?? '—'} ${esc(s.unidade ?? '')}</td>
          <td><span class="${corStatus(s.status)}">${esc(ROTULO_STATUS[s.status] ?? s.status)}</span></td>
          <td class="num">${s.valor_estimado ? 'R$ ' + fmtNum(s.valor_estimado) : '—'}</td>
        </tr>`).join('') || `<tr><td colspan="5" class="vazio">Nenhuma solicitação de compra ainda.</td></tr>`}
      </tbody></table>
    </div></div>`

  $('#cp-novo').onclick = () => formCompraFazenda(() => paginaCompras())
}

function formCompraFazenda (aoSalvar) {
  const fundo = document.createElement('div')
  fundo.className = 'modal-fundo'
  fundo.innerHTML = `<div class="modal">
    <h3>Nova solicitação de compra</h3>
    <div class="form-grade">
      <div class="campo" style="grid-column:1/-1;"><label>Produto ou serviço *</label><input id="cp-produto"></div>
      <div class="campo"><label>Quantidade</label><input id="cp-qtd"></div>
      <div class="campo"><label>Unidade</label><input id="cp-unid" placeholder="un, kg, saco..."></div>
      <div class="campo"><label>Urgência</label><select id="cp-urg">
        <option value="NAO_URGENTE_5D">Normal — 5 dias</option><option value="URGENTE_4H">Urgente — 4 horas</option></select></div>
      <div class="campo"><label>Valor estimado (R$)</label><input id="cp-valor" inputmode="decimal"></div>
      <div class="campo"><label>Local de entrega</label><input id="cp-local" placeholder="Fazenda Ouro Branco"></div>
    </div>
    <div class="acoes" style="margin-top:14px;"><button class="btn" id="cp-salvar">Enviar solicitação</button>
      <button class="btn-secundario" id="cp-fechar">Fechar</button></div>
    <div class="recado oculto" id="cp-recado"></div>
  </div>`
  document.body.appendChild(fundo)
  const fechar = () => fundo.remove()
  fundo.querySelector('#cp-fechar').onclick = fechar
  fundo.onclick = e => { if (e.target === fundo) fechar() }

  fundo.querySelector('#cp-salvar').onclick = async () => {
    const el = fundo.querySelector('#cp-recado')
    const aviso = t => { el.textContent = t; el.classList.remove('oculto'); el.style.borderColor = 'var(--warn-text)'; el.style.color = 'var(--warn-text)' }
    const produto = fundo.querySelector('#cp-produto').value.trim()
    if (!produto) { aviso('Escreva o produto ou serviço.'); return }
    const btn = fundo.querySelector('#cp-salvar'); btn.disabled = true; btn.textContent = 'Enviando...'
    const { error } = await db.from('solicitacao_compra').insert({
      produto_servico: produto, quantidade: fundo.querySelector('#cp-qtd').value.trim() || null,
      unidade: fundo.querySelector('#cp-unid').value.trim() || null, urgencia: fundo.querySelector('#cp-urg').value,
      valor_estimado: numeroBR(fundo.querySelector('#cp-valor').value), local_entrega: fundo.querySelector('#cp-local').value.trim() || 'Fazenda Ouro Branco',
      empresa_id: FAZENDA_EMPRESA_ID, solicitante_id: PERFIL.pessoaId
    })
    btn.disabled = false; btn.textContent = 'Enviar solicitação'
    if (error) { aviso(error.message); return }
    fechar(); aoSalvar()
  }
}
