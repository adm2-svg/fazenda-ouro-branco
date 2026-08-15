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
  notas: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="13" y2="17"/></svg>',
  contratos: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 12h6M9 16h6M9 8h1"/><path d="M4 3h11l5 5v13a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z"/></svg>',
  relatorios: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 20V10M12 20V4M6 20v-6"/></svg>',
  estoque: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="M3.3 7L12 12l8.7-5M12 22V12"/></svg>',
  cadastro: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="8" y1="13" x2="14" y2="13"/><line x1="8" y1="17" x2="12" y2="17"/></svg>',
  fiscal: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 3h11l5 5v13a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z"/><path d="M14 2v6h6"/><path d="m9 15 2 2 4-4"/></svg>'
}
const PAGINAS = {
  visao_geral: { nome: 'Visão geral', render: paginaVisaoGeral },
  lotes: { nome: 'Lotes', render: paginaLotes },
  estoque: { nome: 'Estoque', render: paginaEstoque },
  financeiro: { nome: 'Financeiro', render: paginaFinanceiro },
  compras: { nome: 'Compras', render: paginaCompras },
  contratos: { nome: 'Contratos', render: paginaContratos },
  notas: { nome: 'Notas fiscais', render: paginaNotasFiscais },
  fiscal: { nome: 'NFP-e (emissão)', render: paginaFiscal },
  cadastro: { nome: 'Cadastro', render: paginaCadastroFazenda },
  relatorios: { nome: 'Relatórios', render: paginaRelatorios }
}
function montarMenu () {
  $('#menu').innerHTML = Object.entries(PAGINAS).map(([chave, p]) =>
    `<a data-chave="${chave}">${ICONES[chave]}<span>${esc(p.nome)}</span></a>`).join('')
  $('#menu').querySelectorAll('a').forEach(a => { a.onclick = () => irPara(a.dataset.chave) })

  // tema — aplica o salvo no seletor e liga a troca
  const temaAtual = localStorage.getItem('fazenda-tema') || ''
  $('#sel-tema').value = temaAtual
  $('#sel-tema').onchange = () => {
    const v = $('#sel-tema').value
    if (v) document.documentElement.setAttribute('data-tema', v)
    else document.documentElement.removeAttribute('data-tema')
    localStorage.setItem('fazenda-tema', v)
  }

  // menu no celular: painel deslizante, fecha sozinho ao escolher página
  $('#btn-abrir-menu')?.addEventListener('click', () => {
    $('.nav')?.classList.add('aberto')
    $('#fundo-nav-mobile')?.classList.add('aberto')
  })
  $('#fundo-nav-mobile')?.addEventListener('click', () => {
    $('.nav')?.classList.remove('aberto')
    $('#fundo-nav-mobile')?.classList.remove('aberto')
  })
  $('#menu').addEventListener('click', () => {
    $('.nav')?.classList.remove('aberto')
    $('#fundo-nav-mobile')?.classList.remove('aberto')
  })
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
      <table><thead><tr><th>Data</th><th>Tipo</th><th>Fornecedor/cliente</th><th>Nº NF</th><th>Lote</th><th class="num">Valor</th><th>Financeiro</th><th></th></tr></thead><tbody>
        ${(notas || []).map(n => `<tr>
          <td class="texto-dim2">${fmtData(n.data)}</td>
          <td><span class="chip">${n.tipo === 'SAIDA' ? 'Saída' : 'Entrada'}</span></td>
          <td>${esc(n.fornecedor_cliente ?? '—')}</td><td class="texto-dim">${esc(n.numero_nf ?? '—')}</td>
          <td class="texto-dim2">${esc(n.lote?.nome ?? '—')}</td><td class="num">R$ ${fmtNum(n.valor)}</td>
          <td>${n.lancamento_financeiro_id ? '<span class="badge-bom">lançado</span>' : '<span class="texto-dim2">—</span>'}</td>
          <td>${n.arquivo_url ? `<button class="btn-secundario mini" data-abrir-nf="${esc(n.arquivo_url)}">abrir</button>` : '—'}</td>
        </tr>`).join('') || `<tr><td colspan="8" class="vazio">Nenhuma nota fiscal anexada ainda.</td></tr>`}
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
      <div class="campo"><label>Tipo</label><select id="nf-tipo"><option value="ENTRADA">Entrada (compra)</option><option value="SAIDA">Saída (venda)</option></select></div>
      <div class="campo"><label>Fornecedor/cliente</label><input id="nf-fc"></div>
      <div class="campo"><label>Nº da NF</label><input id="nf-num"></div>
      <div class="campo"><label>Valor (R$)</label><input id="nf-valor" inputmode="decimal"></div>
      <div class="campo"><label>Lote (opcional)</label><select id="nf-lote"><option value="">—</option>
        ${lotes.map(l => `<option value="${l.id}" ${l.id === preset.loteId ? 'selected' : ''}>${esc(l.nome)}</option>`).join('')}</select></div>
    </div>
    <div class="campo" style="margin-top:10px;"><label>Arquivo (PDF ou imagem) *</label>
      <input type="file" id="nf-arquivo" accept=".pdf,.jpg,.jpeg,.png,.xml"></div>
    <label style="display:flex;align-items:center;gap:8px;font-size:13px;margin-top:12px;">
      <input type="checkbox" id="nf-gerar-fin" checked> Já lançar automaticamente no Financeiro</label>
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
      const tipoNf = fundo.querySelector('#nf-tipo').value
      const valor = numeroBR(fundo.querySelector('#nf-valor').value) || 0
      const dataNf = fundo.querySelector('#nf-data').value
      const fornecedorCliente = fundo.querySelector('#nf-fc').value.trim() || null
      const numeroNf = fundo.querySelector('#nf-num').value.trim() || null

      // se marcado, cria o lançamento financeiro já vinculado — NF de
      // entrada (compra) vira saída de dinheiro, NF de saída (venda) vira entrada
      let lancamentoId = null
      if (fundo.querySelector('#nf-gerar-fin').checked && valor > 0) {
        const { data: lanc, error: erroLanc } = await db.from('lancamento_financeiro').insert({
          data_lancamento: dataNf, tipo: tipoNf === 'ENTRADA' ? 'SAIDA' : 'ENTRADA',
          centro_custo_id: FAZENDA_CENTRO_CUSTO_ID, valor, situacao: 'PLANEJADO',
          descricao: `NF ${numeroNf ?? ''} — ${fornecedorCliente ?? 'sem fornecedor/cliente'}`.trim(),
          registrado_por: PERFIL.pessoaId
        }).select('id').single()
        if (erroLanc) { btn.disabled = false; btn.textContent = 'Salvar'; aviso('Nota salva, mas não deu pra gerar o lançamento financeiro: ' + erroLanc.message); }
        else lancamentoId = lanc.id
      }

      const { error } = await db.from('fazenda_nota_fiscal').insert({
        data: dataNf, tipo: tipoNf, fornecedor_cliente: fornecedorCliente, numero_nf: numeroNf,
        valor, lote_id: fundo.querySelector('#nf-lote').value || null,
        lancamento_financeiro_id: lancamentoId,
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
  area.innerHTML = `<div id="sub-fin"></div>`
  subLancamentos($('#sub-fin'))
}

async function subLancamentos (alvo) {
  const [{ data: lancs }, { data: contas }, { data: categorias }, { data: funcionarios }] = await Promise.all([
    db.from('lancamento_financeiro').select('*, conta:conta_id(nome), categoria:categoria_id(nome), funcionario:fazenda_funcionario_id(nome)')
      .eq('centro_custo_id', FAZENDA_CENTRO_CUSTO_ID).order('data_lancamento', { ascending: false }).limit(300),
    db.from('conta_financeira').select('id,nome').order('nome'),
    db.from('categoria_financeira').select('id,nome').order('nome'),
    db.from('fazenda_funcionario').select('id,nome').eq('ativo', true).order('nome')
  ])
  window.__FAZENDA_CONTAS = contas || []
  window.__FAZENDA_CATEGORIAS = categorias || []
  window.__FAZENDA_FUNCIONARIOS = funcionarios || []
  const lista = lancs || []
  const despesas = lista.filter(l => l.tipo === 'SAIDA').reduce((s, l) => s + Number(l.valor || 0), 0)
  const receitas = lista.filter(l => l.tipo === 'ENTRADA').reduce((s, l) => s + Number(l.valor || 0), 0)

  alvo.innerHTML = `
    <div class="resumo-topo">
      ${kpi('Despesas', 'R$ ' + fmtNum(despesas))}
      ${kpi('Receitas', 'R$ ' + fmtNum(receitas))}
      ${kpi('Resultado', 'R$ ' + fmtNum(receitas - despesas))}
    </div>
    ${PERFIL.editavel ? `<div class="acoes" style="margin-bottom:16px;"><button class="btn" id="fin-novo">+ Novo lançamento</button></div>` : ''}
    <div class="panel" style="padding:0;"><div class="tabela-scroll">
      <table><thead><tr><th>Data</th><th>Tipo</th><th>Categoria</th><th>Conta</th><th>Funcionário/prestador</th><th>Descrição</th><th class="num">Valor</th><th>Situação</th></tr></thead><tbody>
        ${lista.map(l => `<tr>
          <td class="texto-dim2">${fmtData(l.data_lancamento)}</td>
          <td>${l.tipo === 'SAIDA' ? '<span class="badge-alerta">Saída</span>' : '<span class="badge-bom">Entrada</span>'}</td>
          <td class="texto-dim2">${esc(l.categoria?.nome ?? '—')}</td><td class="texto-dim2">${esc(l.conta?.nome ?? '—')}</td>
          <td class="texto-dim">${esc(l.funcionario?.nome ?? '—')}</td>
          <td>${esc(l.descricao ?? '—')}</td><td class="num">R$ ${fmtNum(l.valor)}</td>
          <td>${l.situacao === 'EFETIVADO' ? '<span class="badge-bom">efetivado</span>' : '<span class="chip">pendente</span>'}</td>
        </tr>`).join('') || `<tr><td colspan="8" class="vazio">Nenhum lançamento ainda.</td></tr>`}
      </tbody></table>
    </div></div>`

  if (PERFIL.editavel) $('#fin-novo').onclick = () => formLancamento(() => subLancamentos(alvo))
}

// ----- Funcionários e Prestadores de Serviço -----
async function subFuncionarios (alvo) {
  const { data } = await db.from('fazenda_funcionario').select('*').order('nome')
  const lista = data || []
  alvo.innerHTML = `
    ${PERFIL.editavel ? `<div class="acoes" style="margin-bottom:16px;"><button class="btn" id="fc-novo">+ Adicionar funcionário/prestador</button></div>` : ''}
    <div class="panel" style="padding:0;"><div class="tabela-scroll">
      <table><thead><tr><th>Nome</th><th>Tipo</th><th>Função</th><th class="num">Valor de referência</th><th>Pagamento</th><th>Status</th>${PERFIL.editavel ? '<th></th>' : ''}</tr></thead><tbody>
        ${lista.map(f => `<tr>
          <td><b>${esc(f.nome)}</b></td>
          <td><span class="chip">${f.tipo === 'PRESTADOR' ? 'Prestador de serviço' : 'Funcionário'}</span></td>
          <td class="texto-dim">${esc(f.funcao ?? '—')}</td>
          <td class="num">${f.valor_referencia ? 'R$ ' + fmtNum(f.valor_referencia) : '—'}</td>
          <td class="texto-dim2">${esc(f.forma_pagamento ?? '—')}</td>
          <td>${f.ativo ? '<span class="badge-bom">ativo</span>' : '<span class="chip">inativo</span>'}</td>
          ${PERFIL.editavel ? `<td><button class="btn-secundario mini" data-editar="${f.id}">editar</button></td>` : ''}
        </tr>`).join('') || `<tr><td colspan="${PERFIL.editavel ? 7 : 6}" class="vazio">Nenhum funcionário ou prestador cadastrado ainda.</td></tr>`}
      </tbody></table>
    </div></div>`

  if (PERFIL.editavel) {
    $('#fc-novo').onclick = () => formFuncionario(null, () => subFuncionarios(alvo))
    alvo.querySelectorAll('[data-editar]').forEach(b => {
      b.onclick = () => formFuncionario(lista.find(x => x.id === b.dataset.editar), () => subFuncionarios(alvo))
    })
  }
}
function formFuncionario (registro, aoSalvar) {
  const fundo = document.createElement('div')
  fundo.className = 'modal-fundo'
  fundo.innerHTML = `<div class="modal">
    <h3>${registro ? 'Editar' : 'Novo'} funcionário/prestador</h3>
    <div class="form-grade">
      <div class="campo" style="grid-column:1/-1;"><label>Nome *</label><input id="fc-nome" value="${esc(registro?.nome ?? '')}"></div>
      <div class="campo"><label>Tipo</label><select id="fc-tipo">
        <option value="FUNCIONARIO" ${(!registro || registro.tipo === 'FUNCIONARIO') ? 'selected' : ''}>Funcionário</option>
        <option value="PRESTADOR" ${registro?.tipo === 'PRESTADOR' ? 'selected' : ''}>Prestador de serviço</option>
      </select></div>
      <div class="campo"><label>Função</label><input id="fc-funcao" value="${esc(registro?.funcao ?? '')}" placeholder="ex: vaqueiro, veterinário"></div>
      <div class="campo"><label>Valor de referência (R$)</label><input id="fc-valor" inputmode="decimal" value="${registro?.valor_referencia ?? ''}"></div>
      <div class="campo"><label>Forma de pagamento</label><input id="fc-pagto" value="${esc(registro?.forma_pagamento ?? '')}" placeholder="ex: mensal, por diária"></div>
      <div class="campo"><label>Status</label><select id="fc-ativo">
        <option value="true" ${(!registro || registro.ativo) ? 'selected' : ''}>Ativo</option>
        <option value="false" ${(registro && !registro.ativo) ? 'selected' : ''}>Inativo</option>
      </select></div>
    </div>
    <div class="campo" style="margin-top:10px;"><label>Observações</label><textarea id="fc-obs" style="min-height:60px;">${esc(registro?.observacoes ?? '')}</textarea></div>
    <div class="acoes" style="margin-top:14px;"><button class="btn" id="fc-salvar">Salvar</button>
      <button class="btn-secundario" id="fc-fechar">Fechar</button></div>
    <div class="recado oculto" id="fc-recado"></div>
  </div>`
  document.body.appendChild(fundo)
  const fechar = () => fundo.remove()
  fundo.querySelector('#fc-fechar').onclick = fechar
  fundo.onclick = e => { if (e.target === fundo) fechar() }

  fundo.querySelector('#fc-salvar').onclick = async () => {
    const el = fundo.querySelector('#fc-recado')
    const aviso = t => { el.textContent = t; el.classList.remove('oculto'); el.style.borderColor = 'var(--warn-text)'; el.style.color = 'var(--warn-text)' }
    const nome = fundo.querySelector('#fc-nome').value.trim()
    if (!nome) { aviso('Escreva o nome.'); return }
    const btn = fundo.querySelector('#fc-salvar'); btn.disabled = true; btn.textContent = 'Salvando...'
    const corpo = {
      nome, tipo: fundo.querySelector('#fc-tipo').value, funcao: fundo.querySelector('#fc-funcao').value.trim() || null,
      valor_referencia: numeroBR(fundo.querySelector('#fc-valor').value), forma_pagamento: fundo.querySelector('#fc-pagto').value.trim() || null,
      ativo: fundo.querySelector('#fc-ativo').value === 'true', observacoes: fundo.querySelector('#fc-obs').value.trim() || null
    }
    let error
    if (registro) { ({ error } = await db.from('fazenda_funcionario').update(corpo).eq('id', registro.id)) }
    else { ({ error } = await db.from('fazenda_funcionario').insert({ ...corpo, criado_por: PERFIL.pessoaId })) }
    btn.disabled = false; btn.textContent = 'Salvar'
    if (error) { aviso(error.message); return }
    fechar(); aoSalvar()
  }
}

function formLancamento (aoSalvar) {
  const contas = window.__FAZENDA_CONTAS || []
  const categorias = window.__FAZENDA_CATEGORIAS || []
  const funcionarios = window.__FAZENDA_FUNCIONARIOS || []
  const fundo = document.createElement('div')
  fundo.className = 'modal-fundo'
  fundo.innerHTML = `<div class="modal">
    <h3>Novo lançamento financeiro</h3>
    <div class="form-grade">
      <div class="campo"><label>Data *</label><input type="date" id="fn-data" value="${hojeISO()}"></div>
      <div class="campo"><label>Tipo</label><select id="fn-tipo"><option value="SAIDA">Saída (despesa)</option><option value="ENTRADA">Entrada (receita)</option></select></div>
      <div class="campo"><label>Categoria</label><select id="fn-categoria"><option value="">—</option>${categorias.map(c => `<option value="${c.id}">${esc(c.nome)}</option>`).join('')}</select></div>
      <div class="campo"><label>Conta</label><select id="fn-conta"><option value="">—</option>${contas.map(c => `<option value="${c.id}">${esc(c.nome)}</option>`).join('')}</select></div>
      <div class="campo"><label>Funcionário/prestador (opcional)</label><select id="fn-funcionario"><option value="">—</option>${funcionarios.map(f => `<option value="${f.id}">${esc(f.nome)}</option>`).join('')}</select></div>
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
      fazenda_funcionario_id: fundo.querySelector('#fn-funcionario').value || null,
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

// ==================================================================
// CONTRATOS  (lê juridico_contrato filtrado por empresa Fazenda Ouro
// Branco — mesmo princípio de Compras e Financeiro)
// ==================================================================
async function paginaContratos () {
  $('#subtitulo-pagina').textContent = 'Solicitação de contrato — sincronizado com o Jurídico do Gefoscal'
  const area = $('#area')
  area.innerHTML = `<p class="texto-dim2">carregando...</p>`

  const { data, error } = await db.from('juridico_contrato').select('*')
    .eq('empresa_id', FAZENDA_EMPRESA_ID).order('criado_em', { ascending: false })
  if (error) { area.innerHTML = `<p class="vazio">${esc(error.message)}</p>`; return }
  const lista = data || []
  const ROTULO_STATUS = { VIGENTE: 'Vigente', EM_RENOVACAO: 'Em renovação', ENCERRADO: 'Encerrado' }
  const corStatus = s => s === 'VIGENTE' ? 'badge-bom' : s === 'ENCERRADO' ? 'chip' : 'badge-alerta'

  area.innerHTML = `
    <div class="acoes" style="margin-bottom:16px;"><button class="btn" id="ct-novo">+ Solicitar contrato</button></div>
    <div class="panel" style="padding:0;"><div class="tabela-scroll">
      <table><thead><tr><th>Título</th><th>Contraparte</th><th>Categoria</th><th class="num">Valor</th><th>Início</th><th>Fim</th><th>Status</th></tr></thead><tbody>
        ${lista.map(c => `<tr>
          <td><b>${esc(c.titulo)}</b></td><td class="texto-dim">${esc(c.contraparte ?? '—')}</td>
          <td class="texto-dim2">${esc(c.categoria ?? '—')}</td><td class="num">${c.valor ? 'R$ ' + fmtNum(c.valor) : '—'}</td>
          <td class="texto-dim2">${c.data_inicio ? fmtData(c.data_inicio) : '—'}</td><td class="texto-dim2">${c.data_fim ? fmtData(c.data_fim) : '—'}</td>
          <td><span class="${corStatus(c.status)}">${esc(ROTULO_STATUS[c.status] ?? c.status)}</span></td>
        </tr>`).join('') || `<tr><td colspan="7" class="vazio">Nenhum contrato solicitado ainda.</td></tr>`}
      </tbody></table>
    </div></div>`

  $('#ct-novo').onclick = () => formContratoFazenda(() => paginaContratos())
}

function formContratoFazenda (aoSalvar) {
  const fundo = document.createElement('div')
  fundo.className = 'modal-fundo'
  fundo.innerHTML = `<div class="modal">
    <h3>Solicitar contrato</h3>
    <p class="texto-dim2" style="font-size:12px;margin:-8px 0 14px;">Vai direto pro Jurídico do Gefoscal cuidar — aparece aqui também conforme for avançando.</p>
    <div class="form-grade">
      <div class="campo" style="grid-column:1/-1;"><label>Título / objeto *</label><input id="ctf-titulo" placeholder="ex: Locação de área de pasto"></div>
      <div class="campo"><label>Contraparte</label><input id="ctf-contra"></div>
      <div class="campo"><label>Categoria</label><input id="ctf-cat" placeholder="ex: Arrendamento, Prestação de serviço"></div>
      <div class="campo"><label>Valor estimado (R$)</label><input id="ctf-valor" inputmode="decimal"></div>
      <div class="campo"><label>Início pretendido</label><input type="date" id="ctf-inicio"></div>
      <div class="campo"><label>Fim pretendido</label><input type="date" id="ctf-fim"></div>
    </div>
    <div class="campo" style="margin-top:10px;"><label>Observações</label><textarea id="ctf-obs" style="min-height:64px;" placeholder="detalhe o que precisa constar no contrato"></textarea></div>
    <div class="acoes" style="margin-top:14px;"><button class="btn" id="ctf-salvar">Enviar solicitação</button>
      <button class="btn-secundario" id="ctf-fechar">Fechar</button></div>
    <div class="recado oculto" id="ctf-recado"></div>
  </div>`
  document.body.appendChild(fundo)
  const fechar = () => fundo.remove()
  fundo.querySelector('#ctf-fechar').onclick = fechar
  fundo.onclick = e => { if (e.target === fundo) fechar() }

  fundo.querySelector('#ctf-salvar').onclick = async () => {
    const el = fundo.querySelector('#ctf-recado')
    const aviso = t => { el.textContent = t; el.classList.remove('oculto'); el.style.borderColor = 'var(--warn-text)'; el.style.color = 'var(--warn-text)' }
    const titulo = fundo.querySelector('#ctf-titulo').value.trim()
    if (!titulo) { aviso('Escreva o título/objeto do contrato.'); return }
    const btn = fundo.querySelector('#ctf-salvar'); btn.disabled = true; btn.textContent = 'Enviando...'
    const { error } = await db.from('juridico_contrato').insert({
      titulo, contraparte: fundo.querySelector('#ctf-contra').value.trim() || null,
      categoria: fundo.querySelector('#ctf-cat').value.trim() || null,
      valor: numeroBR(fundo.querySelector('#ctf-valor').value),
      data_inicio: fundo.querySelector('#ctf-inicio').value || null, data_fim: fundo.querySelector('#ctf-fim').value || null,
      observacoes: fundo.querySelector('#ctf-obs').value.trim() || null,
      empresa_id: FAZENDA_EMPRESA_ID, criado_por: PERFIL.pessoaId
    })
    btn.disabled = false; btn.textContent = 'Enviar solicitação'
    if (error) { aviso(error.message); return }
    fechar(); aoSalvar()
  }
}

// ==================================================================
// RELATÓRIOS  (filtro de datas, imprime/baixa)
// ==================================================================
async function paginaRelatorios () {
  $('#subtitulo-pagina').textContent = 'Financeiro e vendas do período — pronto pra imprimir'
  const area = $('#area')
  const hoje = hojeISO()
  const de = new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10)
  area.innerHTML = `
    <div class="panel" style="padding:18px;margin-bottom:18px;">
      <div class="filtros">
        <div class="campo"><label>De</label><input type="date" id="rl-de" value="${de}"></div>
        <div class="campo"><label>Até</label><input type="date" id="rl-ate" value="${hoje}"></div>
        <button class="btn" id="rl-gerar">Gerar relatório</button>
      </div>
    </div>
    <div id="rl-conteudo"></div>`

  const gerar = async () => {
    const dIni = $('#rl-de').value, dFim = $('#rl-ate').value
    $('#rl-conteudo').innerHTML = `<p class="texto-dim2">carregando...</p>`
    const [{ data: lancs }, { data: receitas }] = await Promise.all([
      db.from('lancamento_financeiro').select('*').eq('centro_custo_id', FAZENDA_CENTRO_CUSTO_ID)
        .gte('data_lancamento', dIni).lte('data_lancamento', dFim).order('data_lancamento'),
      db.from('fazenda_receita').select('*, lote:lote_id(nome)').gte('data', dIni).lte('data', dFim).order('data')
    ])
    const despesas = (lancs || []).filter(l => l.tipo === 'SAIDA')
    const entradasFin = (lancs || []).filter(l => l.tipo === 'ENTRADA')
    const totalDespesas = despesas.reduce((s, l) => s + Number(l.valor || 0), 0)
    const totalEntradasFin = entradasFin.reduce((s, l) => s + Number(l.valor || 0), 0)
    const totalVendas = (receitas || []).reduce((s, r) => s + Number(r.valor_liquido || 0), 0)

    $('#rl-conteudo').innerHTML = `
      <div class="acoes" style="margin-bottom:14px;"><button class="btn-secundario" id="rl-imprimir">Baixar / imprimir PDF</button></div>
      <div id="rl-imprimivel">
        <div class="resumo-topo">
          ${kpi('Despesas no período', 'R$ ' + fmtNum(totalDespesas))}
          ${kpi('Entradas financeiras', 'R$ ' + fmtNum(totalEntradasFin))}
          ${kpi('Vendas de gado', 'R$ ' + fmtNum(totalVendas))}
          ${kpi('Resultado', 'R$ ' + fmtNum(totalEntradasFin + totalVendas - totalDespesas))}
        </div>
        <div class="cabeca-secao"><h3 style="font-size:15px;">Despesas (${fmtData(dIni)} a ${fmtData(dFim)})</h3></div>
        <div class="panel" style="padding:0;margin-bottom:18px;"><div class="tabela-scroll">
          <table><thead><tr><th>Data</th><th>Descrição</th><th class="num">Valor</th></tr></thead><tbody>
            ${despesas.map(l => `<tr><td class="texto-dim2">${fmtData(l.data_lancamento)}</td><td>${esc(l.descricao ?? '—')}</td><td class="num">R$ ${fmtNum(l.valor)}</td></tr>`).join('')
              || `<tr><td colspan="3" class="vazio">Nenhuma despesa no período.</td></tr>`}
          </tbody></table>
        </div></div>
        <div class="cabeca-secao"><h3 style="font-size:15px;">Vendas de gado (${fmtData(dIni)} a ${fmtData(dFim)})</h3></div>
        <div class="panel" style="padding:0;"><div class="tabela-scroll">
          <table><thead><tr><th>Data</th><th>Cliente</th><th>Lote</th><th class="num">Peso</th><th class="num">Valor líquido</th></tr></thead><tbody>
            ${(receitas || []).map(r => `<tr><td class="texto-dim2">${fmtData(r.data)}</td><td>${esc(r.cliente ?? '—')}</td>
              <td class="texto-dim2">${esc(r.lote?.nome ?? '—')}</td><td class="num">${fmtNum(r.peso_total, 1)} kg</td><td class="num">R$ ${fmtNum(r.valor_liquido)}</td></tr>`).join('')
              || `<tr><td colspan="5" class="vazio">Nenhuma venda no período.</td></tr>`}
          </tbody></table>
        </div></div>
      </div>`

    $('#rl-imprimir').onclick = () => {
      const janela = window.open('', '_blank')
      janela.document.write(`<html><head><title>Relatório Fazenda Ouro Branco</title>
        <style>body{font-family:Arial,sans-serif;padding:24px;color:#222;} h2{margin-bottom:0;}
        table{width:100%;border-collapse:collapse;margin:14px 0 24px;} th,td{border:1px solid #ccc;padding:6px 8px;text-align:left;font-size:13px;}
        th{background:#f0f0f0;} .num{text-align:right;}</style></head><body>
        <h2>Fazenda Ouro Branco — Relatório</h2><p>Período: ${fmtData(dIni)} a ${fmtData(dFim)}</p>
        ${$('#rl-imprimivel').innerHTML.replace(/<button[^>]*>.*?<\/button>/g, '')}
        </body></html>`)
      janela.document.close()
      setTimeout(() => janela.print(), 300)
    }
  }
  $('#rl-gerar').onclick = gerar
  gerar()
}

// ==================================================================
// ESTOQUE  (ração, sal mineral, medicamento, combustível...)
// ==================================================================
async function paginaEstoque () {
  $('#subtitulo-pagina').textContent = 'Ração, sal mineral, medicamento e outros insumos gerais'
  const area = $('#area')
  area.innerHTML = `<p class="texto-dim2">carregando...</p>`

  const [{ data: movs }] = await Promise.all([
    db.from('fazenda_estoque_movimento').select('*').order('criado_em', { ascending: false }).limit(1000)
  ])
  const lista = movs || []
  const porMaterial = {}
  lista.forEach(m => { if (!porMaterial[m.material]) porMaterial[m.material] = m })
  const itens = Object.values(porMaterial).sort((a, b) => a.material.localeCompare(b.material))

  area.innerHTML = `
    ${PERFIL.editavel ? `<div class="acoes" style="margin-bottom:16px;"><button class="btn" id="es-novo">+ Movimentar estoque</button></div>` : ''}
    <div class="cabeca-secao"><h3 style="font-size:16px;">Saldo atual</h3></div>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:10px;margin-bottom:20px;">
      ${itens.map(m => `<div class="panel" style="padding:14px 16px;">
        <div style="font-weight:600;font-size:13px;margin-bottom:5px;">${esc(m.material)}</div>
        <div style="font-family:var(--serif);font-size:19px;">${fmtNum(m.saldo_apos)} <span style="font-size:12px;color:var(--dim2);">${esc(m.unidade_medida)}</span></div>
        ${m.categoria ? `<div class="texto-dim2" style="font-size:11px;margin-top:3px;">${esc(m.categoria)}</div>` : ''}
      </div>`).join('') || '<p class="vazio">Nenhum material em estoque ainda.</p>'}
    </div>

    <div class="cabeca-secao"><h3 style="font-size:16px;">Movimentações</h3></div>
    <div class="panel" style="padding:0;"><div class="tabela-scroll">
      <table><thead><tr><th>Data</th><th>Material</th><th>Tipo</th><th class="num">Qtde</th><th class="num">Saldo após</th><th>Fornecedor</th></tr></thead><tbody>
        ${lista.map(m => `<tr>
          <td class="texto-dim2">${fmtData(m.data)}</td><td>${esc(m.material)}</td>
          <td>${m.tipo_mov === 'ENTRADA' ? '<span class="badge-bom">Entrada</span>' : '<span class="texto-dim">Saída</span>'}</td>
          <td class="num">${fmtNum(m.quantidade)} ${esc(m.unidade_medida)}</td>
          <td class="num">${fmtNum(m.saldo_apos)} ${esc(m.unidade_medida)}</td>
          <td class="texto-dim2">${esc(m.fornecedor ?? '—')}</td>
        </tr>`).join('') || `<tr><td colspan="6" class="vazio">Nenhuma movimentação ainda.</td></tr>`}
      </tbody></table>
    </div></div>`

  if (PERFIL.editavel) $('#es-novo').onclick = () => formEstoque(() => paginaEstoque())
}

function formEstoque (aoSalvar) {
  const fundo = document.createElement('div')
  fundo.className = 'modal-fundo'
  fundo.innerHTML = `<div class="modal">
    <h3>Movimentar estoque</h3>
    <div class="form-grade">
      <div class="campo"><label>Data *</label><input type="date" id="ef-data" value="${hojeISO()}"></div>
      <div class="campo"><label>Material *</label><input id="ef-material" placeholder="ex: Ração, Sal mineral"></div>
      <div class="campo"><label>Categoria</label><input id="ef-categoria"></div>
      <div class="campo"><label>Unidade</label><input id="ef-unidade" value="kg"></div>
      <div class="campo"><label>Tipo</label><select id="ef-tipo"><option value="ENTRADA">Entrada</option><option value="SAIDA">Saída</option></select></div>
      <div class="campo"><label>Quantidade *</label><input id="ef-qtd" inputmode="decimal"></div>
      <div class="campo"><label>Fornecedor</label><input id="ef-fornecedor"></div>
      <div class="campo"><label>Valor (R$)</label><input id="ef-valor" inputmode="decimal"></div>
      <div class="campo"><label>Nº lote</label><input id="ef-lote"></div>
      <div class="campo"><label>Validade</label><input type="date" id="ef-validade"></div>
    </div>
    <div class="campo" style="margin-top:10px;"><label>Observações</label><textarea id="ef-obs" style="min-height:60px;"></textarea></div>
    <div class="acoes" style="margin-top:14px;"><button class="btn" id="ef-salvar">Registrar</button>
      <button class="btn-secundario" id="ef-fechar">Fechar</button></div>
    <div class="recado oculto" id="ef-recado"></div>
  </div>`
  document.body.appendChild(fundo)
  const fechar = () => fundo.remove()
  fundo.querySelector('#ef-fechar').onclick = fechar
  fundo.onclick = e => { if (e.target === fundo) fechar() }

  fundo.querySelector('#ef-salvar').onclick = async () => {
    const el = fundo.querySelector('#ef-recado')
    const aviso = t => { el.textContent = t; el.classList.remove('oculto'); el.style.borderColor = 'var(--warn-text)'; el.style.color = 'var(--warn-text)' }
    const material = fundo.querySelector('#ef-material').value.trim()
    const qtd = numeroBR(fundo.querySelector('#ef-qtd').value)
    if (!material) { aviso('Informe o material.'); return }
    if (qtd === null || qtd <= 0) { aviso('Informe a quantidade.'); return }

    const { data: ultimo } = await db.from('fazenda_estoque_movimento').select('saldo_apos')
      .eq('material', material).order('criado_em', { ascending: false }).limit(1).maybeSingle()
    const saldoAnterior = Number(ultimo?.saldo_apos ?? 0)
    const tipo = fundo.querySelector('#ef-tipo').value
    const saldoApos = tipo === 'SAIDA' ? saldoAnterior - qtd : saldoAnterior + qtd
    if (saldoApos < 0) { aviso('Essa saída deixaria o saldo negativo — confere a quantidade.'); return }

    const btn = fundo.querySelector('#ef-salvar'); btn.disabled = true; btn.textContent = 'Salvando...'
    const { error } = await db.from('fazenda_estoque_movimento').insert({
      data: fundo.querySelector('#ef-data').value, material, categoria: fundo.querySelector('#ef-categoria').value.trim() || null,
      unidade_medida: fundo.querySelector('#ef-unidade').value.trim() || 'kg', tipo_mov: tipo, quantidade: qtd, saldo_apos: saldoApos,
      fornecedor: fundo.querySelector('#ef-fornecedor').value.trim() || null, valor: numeroBR(fundo.querySelector('#ef-valor').value),
      numero_lote: fundo.querySelector('#ef-lote').value.trim() || null, validade: fundo.querySelector('#ef-validade').value || null,
      observacoes: fundo.querySelector('#ef-obs').value.trim() || null, criado_por: PERFIL.pessoaId
    })
    btn.disabled = false; btn.textContent = 'Registrar'
    if (error) { aviso(error.message); return }
    fechar(); aoSalvar()
  }
}

// ==================================================================
// CADASTRO  (fornecedores, clientes, prestadores de serviço — só da
// fazenda, nunca mistura com o cadastro do Gefoscal)
// ==================================================================
async function paginaCadastroFazenda () {
  $('#subtitulo-pagina').textContent = 'Fornecedores, clientes e prestadores de serviço da fazenda'
  const area = $('#area')
  area.innerHTML = `
    <div class="subabas">
      <button data-sub="fornecedores" class="ativo">Fornecedores</button>
      <button data-sub="clientes">Clientes</button>
      <button data-sub="prestadores">Prestadores de Serviço</button>
    </div>
    <div id="sub-cad"></div>`
  area.querySelectorAll('.subabas button').forEach(b => {
    b.onclick = () => {
      area.querySelectorAll('.subabas button').forEach(x => x.classList.toggle('ativo', x === b))
      abrirSubCadastro(b.dataset.sub)
    }
  })
  abrirSubCadastro('fornecedores')
}
function abrirSubCadastro (sub) {
  const alvo = $('#sub-cad')
  alvo.innerHTML = `<p class="texto-dim2">carregando...</p>`
  if (sub === 'fornecedores') subCadastroSimples(alvo, 'fazenda_fornecedor', 'Fornecedor')
  if (sub === 'clientes') subCadastroSimples(alvo, 'fazenda_cliente', 'Cliente')
  if (sub === 'prestadores') subFuncionarios(alvo) // reaproveita o cadastro de funcionário/prestador já existente
}

// cadastro simples reaproveitado por Fornecedores e Clientes (mesma cara)
async function subCadastroSimples (alvo, tabela, rotulo) {
  const { data } = await db.from(tabela).select('*').order('nome')
  const lista = data || []
  if (tabela === 'fazenda_cliente') window.__FAZENDA_CADASTRO_CLIENTES = lista
  alvo.innerHTML = `
    ${PERFIL.editavel ? `<div class="acoes" style="margin-bottom:16px;"><button class="btn" id="cs-novo">+ Adicionar ${rotulo.toLowerCase()}</button></div>` : ''}
    <div class="panel" style="padding:0;"><div class="tabela-scroll">
      <table><thead><tr><th>Nome</th><th>CNPJ/CPF</th><th>Contato</th><th>Telefone</th><th>E-mail</th><th>Status</th>${PERFIL.editavel ? '<th></th>' : ''}</tr></thead><tbody>
        ${lista.map(c => `<tr>
          <td><b>${esc(c.nome)}</b></td><td class="texto-dim">${esc(c.cnpj_cpf ?? '—')}</td>
          <td class="texto-dim2">${esc(c.contato ?? '—')}</td><td class="texto-dim2">${esc(c.telefone ?? '—')}</td>
          <td class="texto-dim2">${esc(c.email ?? '—')}</td>
          <td>${c.ativo ? '<span class="badge-bom">ativo</span>' : '<span class="chip">inativo</span>'}</td>
          ${PERFIL.editavel ? `<td><button class="btn-secundario mini" data-editar="${c.id}">editar</button></td>` : ''}
        </tr>`).join('') || `<tr><td colspan="${PERFIL.editavel ? 7 : 6}" class="vazio">Nenhum ${rotulo.toLowerCase()} cadastrado ainda.</td></tr>`}
      </tbody></table>
    </div></div>`

  if (PERFIL.editavel) {
    $('#cs-novo').onclick = () => formCadastroSimples(tabela, rotulo, null, () => subCadastroSimples(alvo, tabela, rotulo))
    alvo.querySelectorAll('[data-editar]').forEach(b => {
      b.onclick = () => formCadastroSimples(tabela, rotulo, lista.find(x => x.id === b.dataset.editar), () => subCadastroSimples(alvo, tabela, rotulo))
    })
  }
}
function formCadastroSimples (tabela, rotulo, registro, aoSalvar) {
  const fundo = document.createElement('div')
  fundo.className = 'modal-fundo'
  fundo.innerHTML = `<div class="modal">
    <h3>${registro ? 'Editar' : 'Novo'} ${rotulo.toLowerCase()}</h3>
    <div class="form-grade">
      <div class="campo" style="grid-column:1/-1;"><label>Nome *</label><input id="cf-nome" value="${esc(registro?.nome ?? '')}"></div>
      <div class="campo"><label>CNPJ/CPF</label><input id="cf-doc" value="${esc(registro?.cnpj_cpf ?? '')}"></div>
      <div class="campo"><label>Contato</label><input id="cf-contato" value="${esc(registro?.contato ?? '')}"></div>
      <div class="campo"><label>Telefone</label><input id="cf-tel" value="${esc(registro?.telefone ?? '')}"></div>
      <div class="campo"><label>E-mail</label><input id="cf-email" value="${esc(registro?.email ?? '')}"></div>
      ${tabela === 'fazenda_fornecedor' ? `<div class="campo"><label>Categoria</label><input id="cf-cat" value="${esc(registro?.categoria ?? '')}" placeholder="ex: ração, veterinário"></div>` : ''}
      <div class="campo"><label>Status</label><select id="cf-ativo">
        <option value="true" ${(!registro || registro.ativo) ? 'selected' : ''}>Ativo</option>
        <option value="false" ${(registro && !registro.ativo) ? 'selected' : ''}>Inativo</option>
      </select></div>
    </div>
    <div class="campo" style="margin-top:10px;"><label>Observações</label><textarea id="cf-obs" style="min-height:60px;">${esc(registro?.observacoes ?? '')}</textarea></div>
    <div class="acoes" style="margin-top:14px;"><button class="btn" id="cf-salvar">Salvar</button>
      <button class="btn-secundario" id="cf-fechar">Fechar</button></div>
    <div class="recado oculto" id="cf-recado"></div>
  </div>`
  document.body.appendChild(fundo)
  const fechar = () => fundo.remove()
  fundo.querySelector('#cf-fechar').onclick = fechar
  fundo.onclick = e => { if (e.target === fundo) fechar() }

  fundo.querySelector('#cf-salvar').onclick = async () => {
    const el = fundo.querySelector('#cf-recado')
    const aviso = t => { el.textContent = t; el.classList.remove('oculto'); el.style.borderColor = 'var(--warn-text)'; el.style.color = 'var(--warn-text)' }
    const nome = fundo.querySelector('#cf-nome').value.trim()
    if (!nome) { aviso('Escreva o nome.'); return }
    const btn = fundo.querySelector('#cf-salvar'); btn.disabled = true; btn.textContent = 'Salvando...'
    const corpo = {
      nome, cnpj_cpf: fundo.querySelector('#cf-doc').value.trim() || null, contato: fundo.querySelector('#cf-contato').value.trim() || null,
      telefone: fundo.querySelector('#cf-tel').value.trim() || null, email: fundo.querySelector('#cf-email').value.trim() || null,
      ativo: fundo.querySelector('#cf-ativo').value === 'true', observacoes: fundo.querySelector('#cf-obs').value.trim() || null
    }
    if (tabela === 'fazenda_fornecedor') corpo.categoria = fundo.querySelector('#cf-cat').value.trim() || null
    let error
    if (registro) { ({ error } = await db.from(tabela).update(corpo).eq('id', registro.id)) }
    else { ({ error } = await db.from(tabela).insert({ ...corpo, criado_por: PERFIL.pessoaId })) }
    btn.disabled = false; btn.textContent = 'Salvar'
    if (error) { aviso(error.message); return }
    fechar(); aoSalvar()
  }
}

// ==================================================================
// FISCAL  (config da fazenda como emitente + emissão de NFP-e de
// verdade, via edge function conectada num provedor externo)
// ==================================================================
async function paginaFiscal () {
  $('#subtitulo-pagina').textContent = 'Configuração fiscal e emissão de NFP-e'
  const area = $('#area')
  area.innerHTML = `
    <div class="subabas">
      <button data-sub="config" class="ativo">Configuração</button>
      <button data-sub="emitir">Notas emitidas</button>
    </div>
    <div id="sub-fiscal"></div>`
  area.querySelectorAll('.subabas button').forEach(b => {
    b.onclick = () => {
      area.querySelectorAll('.subabas button').forEach(x => x.classList.toggle('ativo', x === b))
      abrirSubFiscal(b.dataset.sub)
    }
  })
  abrirSubFiscal('config')
}
function abrirSubFiscal (sub) {
  const alvo = $('#sub-fiscal')
  alvo.innerHTML = `<p class="texto-dim2">carregando...</p>`
  if (sub === 'config') subConfigFiscal(alvo)
  if (sub === 'emitir') subNotasEmitidas(alvo)
}

// ----- Configuração fiscal (dados do emitente) -----
async function subConfigFiscal (alvo) {
  const { data: cfg } = await db.from('fazenda_config_fiscal').select('*').maybeSingle()
  alvo.innerHTML = `
    <div class="panel" style="padding:20px;max-width:760px;">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:16px;">
        <h3 style="font-size:16px;margin:0;">Dados do emitente</h3>
        ${cfg?.ativo ? '<span class="badge-bom">ativo pra emissão</span>' : '<span class="badge-alerta">ainda não ativado</span>'}
      </div>
      <div class="form-grade">
        <div class="campo" style="grid-column:1/-1;"><label>Razão social / Nome *</label><input id="cfg-razao" value="${esc(cfg?.razao_social ?? 'Fazenda Ouro Branco')}"></div>
        <div class="campo"><label>Tipo</label><select id="cfg-tipo">
          <option value="CPF" ${(!cfg || cfg.tipo_pessoa === 'CPF') ? 'selected' : ''}>CPF (pessoa física)</option>
          <option value="CNPJ" ${cfg?.tipo_pessoa === 'CNPJ' ? 'selected' : ''}>CNPJ (pessoa jurídica)</option>
        </select></div>
        <div class="campo"><label>Documento (CPF ou CNPJ) *</label><input id="cfg-doc" value="${esc(cfg?.documento ?? '')}" placeholder="só números"></div>
        <div class="campo"><label>Inscrição Estadual *</label><input id="cfg-ie" value="${esc(cfg?.inscricao_estadual ?? '')}"></div>
        <div class="campo"><label>Ambiente</label><select id="cfg-ambiente">
          <option value="homologacao" ${(!cfg || cfg.ambiente === 'homologacao') ? 'selected' : ''}>Homologação (teste)</option>
          <option value="producao" ${cfg?.ambiente === 'producao' ? 'selected' : ''}>Produção (nota valendo de verdade)</option>
        </select></div>
        <div class="campo"><label>Série</label><input id="cfg-serie" value="${cfg?.serie ?? 1}"></div>
        <div class="campo" style="grid-column:1/-1;"><label>Logradouro</label><input id="cfg-logra" value="${esc(cfg?.logradouro ?? '')}"></div>
        <div class="campo"><label>Número</label><input id="cfg-num" value="${esc(cfg?.numero ?? '')}"></div>
        <div class="campo"><label>Bairro</label><input id="cfg-bairro" value="${esc(cfg?.bairro ?? '')}"></div>
        <div class="campo"><label>Município</label><input id="cfg-mun" value="${esc(cfg?.municipio ?? '')}"></div>
        <div class="campo"><label>UF</label><input id="cfg-uf" value="${esc(cfg?.uf ?? '')}" maxlength="2" style="text-transform:uppercase;"></div>
        <div class="campo"><label>CEP</label><input id="cfg-cep" value="${esc(cfg?.cep ?? '')}"></div>
      </div>
      <label style="display:flex;align-items:center;gap:8px;font-size:13px;margin-top:16px;">
        <input type="checkbox" id="cfg-ativo" ${cfg?.ativo ? 'checked' : ''}> Ativar emissão (só marca depois de confirmar tudo com o contador/provedor)</label>
      <div class="acoes" style="margin-top:16px;"><button class="btn" id="cfg-salvar">Salvar configuração</button></div>
      <div class="recado oculto" id="cfg-recado"></div>
      <p class="texto-dim2" style="font-size:11.5px;margin-top:14px;">
        Pra emissão funcionar de verdade, também precisa da chave do provedor (FAZENDA_NFE_TOKEN) configurada
        no Supabase pelo administrador — isso não fica aqui na tela, fica guardado com segurança do lado do servidor.</p>
    </div>`

  $('#cfg-salvar').onclick = async () => {
    const el = $('#cfg-recado')
    const aviso = t => { el.textContent = t; el.classList.remove('oculto'); el.style.borderColor = 'var(--warn-text)'; el.style.color = 'var(--warn-text)' }
    const doc = $('#cfg-doc').value.trim()
    const ie = $('#cfg-ie').value.trim()
    if (!doc) { aviso('Informe o CPF ou CNPJ.'); return }
    if (!ie) { aviso('Informe a Inscrição Estadual.'); return }
    const btn = $('#cfg-salvar'); btn.disabled = true; btn.textContent = 'Salvando...'
    const corpo = {
      razao_social: $('#cfg-razao').value.trim(), tipo_pessoa: $('#cfg-tipo').value, documento: doc.replace(/\D/g, ''),
      inscricao_estadual: ie, ambiente: $('#cfg-ambiente').value, serie: Number($('#cfg-serie').value) || 1,
      logradouro: $('#cfg-logra').value.trim() || null, numero: $('#cfg-num').value.trim() || null,
      bairro: $('#cfg-bairro').value.trim() || null, municipio: $('#cfg-mun').value.trim() || null,
      uf: $('#cfg-uf').value.trim().toUpperCase() || null, cep: $('#cfg-cep').value.trim() || null,
      ativo: $('#cfg-ativo').checked, atualizado_por: PERFIL.pessoaId, atualizado_em: new Date().toISOString()
    }
    let error
    if (cfg?.id) { ({ error } = await db.from('fazenda_config_fiscal').update(corpo).eq('id', cfg.id)) }
    else { ({ error } = await db.from('fazenda_config_fiscal').insert(corpo)) }
    btn.disabled = false; btn.textContent = 'Salvar configuração'
    if (error) { aviso(error.message); return }
    el.textContent = 'Salvo.'; el.classList.remove('oculto'); el.style.borderColor = 'var(--good-text)'; el.style.color = 'var(--good-text)'
    subConfigFiscal(alvo)
  }
}

// ----- Notas emitidas -----
async function subNotasEmitidas (alvo) {
  const { data } = await db.from('fazenda_nfe').select('*').order('criado_em', { ascending: false })
  const lista = data || []
  const ROTULO = { RASCUNHO: 'Rascunho', ENVIADA: 'Enviada', AUTORIZADA: 'Autorizada', REJEITADA: 'Rejeitada', CANCELADA: 'Cancelada' }
  const cor = s => s === 'AUTORIZADA' ? 'badge-bom' : s === 'REJEITADA' ? 'badge-alerta' : 'chip'

  alvo.innerHTML = `
    <div class="acoes" style="margin-bottom:16px;"><button class="btn" id="nfe-novo">+ Nova NFP-e</button></div>
    <div class="panel" style="padding:0;"><div class="tabela-scroll">
      <table><thead><tr><th>Nº</th><th>Tipo</th><th>Destinatário</th><th class="num">Valor</th><th>Status</th><th></th></tr></thead><tbody>
        ${lista.map(n => `<tr>
          <td class="texto-dim2">${n.numero ?? '—'}</td>
          <td><span class="chip">${n.tipo === 'SAIDA' ? 'Saída' : 'Entrada'}</span></td>
          <td>${esc(n.destinatario_nome)}</td><td class="num">R$ ${fmtNum(n.valor_total)}</td>
          <td><span class="${cor(n.status)}">${esc(ROTULO[n.status] ?? n.status)}</span>${n.motivo_rejeicao ? `<div class="texto-dim2" style="font-size:10.5px;margin-top:2px;">${esc(n.motivo_rejeicao)}</div>` : ''}</td>
          <td>${n.status === 'RASCUNHO' ? `<button class="btn-secundario mini" data-emitir="${n.id}">emitir</button>`
            : n.pdf_url ? `<a class="btn-secundario mini" href="${esc(n.pdf_url)}" target="_blank">DANFE</a>` : '—'}</td>
        </tr>`).join('') || `<tr><td colspan="6" class="vazio">Nenhuma NFP-e criada ainda.</td></tr>`}
      </tbody></table>
    </div></div>`

  $('#nfe-novo').onclick = () => formNfe(() => subNotasEmitidas(alvo))
  alvo.querySelectorAll('[data-emitir]').forEach(b => {
    b.onclick = async () => {
      b.disabled = true; b.textContent = 'emitindo...'
      const { data, error } = await db.functions.invoke('fazenda-emitir-nfe', { body: { nfeId: b.dataset.emitir } })
      if (error || data?.erro) {
        let msg = data?.erro || error?.message
        if (error?.context?.json) { try { const c = await error.context.json(); msg = c?.erro || msg } catch {} }
        alert(msg + (data?.aviso ? '\n\n' + data.aviso : ''))
        subNotasEmitidas(alvo)
        return
      }
      subNotasEmitidas(alvo)
    }
  })
}

function formNfe (aoSalvar) {
  const clientes = window.__FAZENDA_CADASTRO_CLIENTES || []
  const fundo = document.createElement('div')
  fundo.className = 'modal-fundo'
  fundo.innerHTML = `<div class="modal" style="max-width:760px;">
    <h3>Nova NFP-e</h3>
    <p class="texto-dim2" style="font-size:12px;margin:-8px 0 14px;">Cria como rascunho — depois clica em "emitir" na lista pra mandar de verdade.</p>
    <div class="form-grade">
      <div class="campo"><label>Tipo</label><select id="ne-tipo"><option value="SAIDA">Saída (venda)</option><option value="ENTRADA">Entrada</option></select></div>
      <div class="campo" style="grid-column:span 2;"><label>Destinatário (nome) *</label><input id="ne-nome" list="ne-lista-clientes"></div>
      <datalist id="ne-lista-clientes">${clientes.map(c => `<option value="${esc(c.nome)}">`).join('')}</datalist>
      <div class="campo"><label>CPF/CNPJ do destinatário</label><input id="ne-doc"></div>
    </div>
    <div class="cabeca-secao" style="margin-top:16px;"><h4 style="font-size:13px;margin:0;">Itens</h4>
      <button class="btn-secundario mini" id="ne-add-item" type="button">+ item</button></div>
    <div id="ne-itens"></div>
    <div class="campo" style="margin-top:10px;"><label>Observações</label><textarea id="ne-obs" style="min-height:56px;"></textarea></div>
    <div class="acoes" style="margin-top:14px;"><button class="btn" id="ne-salvar">Criar rascunho</button>
      <button class="btn-secundario" id="ne-fechar">Fechar</button></div>
    <div class="recado oculto" id="ne-recado"></div>
  </div>`
  document.body.appendChild(fundo)
  const fechar = () => fundo.remove()
  fundo.querySelector('#ne-fechar').onclick = fechar
  fundo.onclick = e => { if (e.target === fundo) fechar() }

  const linhaItem = () => `<div class="form-grade item-nfe" style="margin-bottom:8px;padding:10px;background:var(--surface2);border-radius:8px;">
    <div class="campo" style="grid-column:span 2;"><label>Descrição *</label><input class="ni-desc"></div>
    <div class="campo"><label>Qtde *</label><input class="ni-qtd" inputmode="decimal"></div>
    <div class="campo"><label>Unidade</label><input class="ni-un" value="UN"></div>
    <div class="campo"><label>Valor unitário (R$) *</label><input class="ni-valor" inputmode="decimal"></div>
    <button class="btn-secundario mini" type="button" data-remover-item style="align-self:end;">remover</button>
  </div>`
  const addItem = () => {
    const div = document.createElement('div')
    div.innerHTML = linhaItem()
    fundo.querySelector('#ne-itens').appendChild(div.firstElementChild)
    fundo.querySelectorAll('[data-remover-item]').forEach(b => { b.onclick = () => b.closest('.item-nfe').remove() })
  }
  fundo.querySelector('#ne-add-item').onclick = addItem
  addItem()

  fundo.querySelector('#ne-salvar').onclick = async () => {
    const el = fundo.querySelector('#ne-recado')
    const aviso = t => { el.textContent = t; el.classList.remove('oculto'); el.style.borderColor = 'var(--warn-text)'; el.style.color = 'var(--warn-text)' }
    const nome = fundo.querySelector('#ne-nome').value.trim()
    if (!nome) { aviso('Informe o destinatário.'); return }
    const itens = [...fundo.querySelectorAll('.item-nfe')].map(div => ({
      descricao: div.querySelector('.ni-desc').value.trim(),
      quantidade: numeroBR(div.querySelector('.ni-qtd').value) || 0,
      unidade: div.querySelector('.ni-un').value.trim() || 'UN',
      valor_unitario: numeroBR(div.querySelector('.ni-valor').value) || 0,
      valor_total: (numeroBR(div.querySelector('.ni-qtd').value) || 0) * (numeroBR(div.querySelector('.ni-valor').value) || 0)
    })).filter(it => it.descricao)
    if (!itens.length) { aviso('Adicione ao menos um item com descrição.'); return }
    const valorTotal = itens.reduce((s, it) => s + it.valor_total, 0)

    const btn = fundo.querySelector('#ne-salvar'); btn.disabled = true; btn.textContent = 'Salvando...'
    const { error } = await db.from('fazenda_nfe').insert({
      tipo: fundo.querySelector('#ne-tipo').value, destinatario_nome: nome,
      destinatario_documento: fundo.querySelector('#ne-doc').value.trim() || null,
      itens, valor_total: valorTotal, observacoes: fundo.querySelector('#ne-obs').value.trim() || null,
      criado_por: PERFIL.pessoaId
    })
    btn.disabled = false; btn.textContent = 'Criar rascunho'
    if (error) { aviso(error.message); return }
    fechar(); aoSalvar()
  }
}

// ==================================================================
// PWA — deixa instalar como app no celular, sem passar por loja
// ==================================================================
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./service-worker.js').catch(() => {})
  })
}
let promptInstalacao = null
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault()
  promptInstalacao = e
  document.getElementById('btn-instalar')?.classList.remove('oculto')
})
document.getElementById('btn-instalar')?.addEventListener('click', async () => {
  if (!promptInstalacao) return
  promptInstalacao.prompt()
  await promptInstalacao.userChoice
  promptInstalacao = null
  document.getElementById('btn-instalar')?.classList.add('oculto')
})
window.addEventListener('appinstalled', () => {
  document.getElementById('btn-instalar')?.classList.add('oculto')
})
