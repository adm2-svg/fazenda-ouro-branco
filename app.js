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

// ----- gráficos simples em HTML/CSS (sem lib externa, mesmo espírito
// leve do resto do app) -----
function graficoBarras (titulo, dados, corBarra = 'var(--rust)') {
  const max = Math.max(...dados.map(d => d.valor), 1)
  return `<div class="cartao-grafico"><h4>${esc(titulo)}</h4>
    ${dados.length ? dados.map(d => `
      <div class="linha-grafico">
        <div class="rotulo-grafico" title="${esc(d.rotulo)}">${esc(d.rotulo)}</div>
        <div class="barra-fundo"><div class="barra-preenchida" style="width:${Math.max(2, d.valor / max * 100)}%;background:${corBarra};"></div></div>
        <div class="valor-grafico">R$ ${fmtNum(d.valor, 0)}</div>
      </div>`).join('') : `<p class="texto-dim2" style="font-size:12.5px;">Sem lançamentos no período.</p>`}
  </div>`
}
function graficoPagoPendente (titulo, totalPago, totalPendente) {
  const soma = totalPago + totalPendente || 1
  const pctPago = totalPago / soma * 100
  return `<div class="cartao-grafico"><h4>${esc(titulo)}</h4>
    <div class="barra-dupla">
      <div style="width:${pctPago}%;background:var(--good-text);"></div>
      <div style="width:${100 - pctPago}%;background:var(--warn-text);"></div>
    </div>
    <div class="legenda-dupla">
      <span><i style="background:var(--good-text);"></i>Pago — R$ ${fmtNum(totalPago, 0)}</span>
      <span><i style="background:var(--warn-text);"></i>Pendente — R$ ${fmtNum(totalPendente, 0)}</span>
    </div>
  </div>`
}
// barras com cor própria por item (ex: faixas de peso) — mesmo layout do
// graficoBarras mas sem cor única fixa
function graficoBarrasCores (titulo, dados) {
  const max = Math.max(...dados.map(d => d.valor), 1)
  return `<div class="cartao-grafico"><h4>${esc(titulo)}</h4>
    ${dados.length ? dados.map(d => `
      <div class="linha-grafico">
        <div class="rotulo-grafico" title="${esc(d.rotulo)}">${esc(d.rotulo)}</div>
        <div class="barra-fundo"><div class="barra-preenchida" style="width:${Math.max(2, d.valor / max * 100)}%;background:${d.cor};"></div></div>
        <div class="valor-grafico">${d.sufixo ? d.valor + ' ' + d.sufixo : fmtNum(d.valor, 0)}</div>
      </div>`).join('') : `<p class="texto-dim2" style="font-size:12.5px;">Sem dados.</p>`}
  </div>`
}
// donut simples via conic-gradient CSS — sem lib externa
function graficoDonut (titulo, fatias) {
  // fatias: [{ rotulo, valor, cor }]
  const total = fatias.reduce((s, f) => s + f.valor, 0) || 1
  let acc = 0
  const stops = fatias.map(f => {
    const de = acc / total * 100
    acc += f.valor
    const ate = acc / total * 100
    return `${f.cor} ${de.toFixed(2)}% ${ate.toFixed(2)}%`
  }).join(', ')
  return `<div class="cartao-grafico"><h4>${esc(titulo)}</h4>
    <div class="donut" style="background:conic-gradient(${stops});">
      <div class="donut-centro"><b>${fmtNum(total, 0)}</b><span>total</span></div>
    </div>
    <div class="legenda-donut">${fatias.map(f => `<span><i style="background:${f.cor};"></i>${esc(f.rotulo)}: ${fmtNum(f.valor, 0)}</span>`).join('')}</div>
  </div>`
}
// linha/área simples em SVG — pra distribuição cumulativa (sem lib externa)
function graficoLinha (titulo, pontos, cor = 'var(--good-text)') {
  const W = 560, H = 190, PAD_E = 34, PAD_D = 10, PAD_C = 14, PAD_B = 26
  const largura = W - PAD_E - PAD_D
  const altura = H - PAD_C - PAD_B
  const passoX = pontos.length > 1 ? largura / (pontos.length - 1) : 0
  const coords = pontos.map((p, i) => [PAD_E + i * passoX, PAD_C + altura - (p.y / 100) * altura])
  const pathLinha = coords.map((c, i) => (i === 0 ? 'M' : 'L') + c[0].toFixed(1) + ',' + c[1].toFixed(1)).join(' ')
  const pathArea = `${pathLinha} L${coords[coords.length - 1][0].toFixed(1)},${PAD_C + altura} L${coords[0][0].toFixed(1)},${PAD_C + altura} Z`
  const passoRotulo = Math.max(1, Math.ceil(pontos.length / 6))
  return `<div class="cartao-grafico"><h4>${esc(titulo)}</h4>
    <svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto;display:block;">
      <line x1="${PAD_E}" y1="${PAD_C}" x2="${PAD_E}" y2="${PAD_C + altura}" stroke="var(--line2)" stroke-width="1"/>
      <line x1="${PAD_E}" y1="${PAD_C + altura}" x2="${W - PAD_D}" y2="${PAD_C + altura}" stroke="var(--line2)" stroke-width="1"/>
      <text x="2" y="${PAD_C + 6}" font-size="9" fill="var(--dim2)">100%</text>
      <text x="2" y="${PAD_C + altura}" font-size="9" fill="var(--dim2)">0%</text>
      <path d="${pathArea}" fill="${cor}" opacity="0.14"></path>
      <path d="${pathLinha}" fill="none" stroke="${cor}" stroke-width="2"></path>
      ${coords.map((c, i) => i % passoRotulo === 0 ? `<text x="${c[0].toFixed(1)}" y="${H - 6}" font-size="9" fill="var(--dim2)" text-anchor="middle">${esc(pontos[i].xRotulo)}</text>` : '').join('')}
    </svg>
  </div>`
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
// grupos do menu — só organiza a exibição, item fora da lista cai
// sozinho em "Outros" (defensivo, nunca some um item por engano)
const GRUPOS_MENU = [
  ['Operação', ['lotes', 'estoque']],
  ['Financeiro', ['financeiro', 'compras', 'notas', 'fiscal', 'relatorios']],
  ['Cadastro', ['contratos', 'cadastro']]
]

function montarMenu () {
  const fixos = `<a data-chave="visao_geral">${ICONES.visao_geral}<span>${esc(PAGINAS.visao_geral.nome)}</span></a>`
  const usadas = new Set(['visao_geral'])
  let agrupado = ''
  GRUPOS_MENU.forEach(([titulo, chaves]) => {
    const itens = chaves.filter(c => PAGINAS[c])
    if (!itens.length) return
    itens.forEach(c => usadas.add(c))
    agrupado += `<div class="grupo-titulo">${esc(titulo)}</div>` +
      itens.map(c => `<a data-chave="${c}">${ICONES[c]}<span>${esc(PAGINAS[c].nome)}</span></a>`).join('')
  })
  const resto = Object.keys(PAGINAS).filter(c => !usadas.has(c))
  if (resto.length) {
    agrupado += `<div class="grupo-titulo">Outros</div>` +
      resto.map(c => `<a data-chave="${c}">${ICONES[c]}<span>${esc(PAGINAS[c].nome)}</span></a>`).join('')
  }

  $('#menu').innerHTML = fixos + agrupado
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
  const [{ data: lotes }, { data: financeiro }, { data: receitas }, { data: pesagens }, { data: sanidade }, { data: pesInd }] = await Promise.all([
    db.from('fazenda_lote').select('id,nome,status,qtde_inicial'),
    db.from('lancamento_financeiro').select('tipo,valor,situacao,data_lancamento').eq('centro_custo_id', FAZENDA_CENTRO_CUSTO_ID),
    db.from('fazenda_receita').select('valor_liquido'),
    db.from('fazenda_pesagem').select('lote_id,peso_medio,data').order('data', { ascending: false }),
    db.from('fazenda_sanidade').select('id,produto,proxima_aplicacao,lote:lote_id(nome)').not('proxima_aplicacao', 'is', null),
    db.from('fazenda_pesagem_individual').select('peso_kg,lote_id')
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

  // resumo da pesagem individual (por animal — brinco/S/N), separado da
  // pesagem por lote que já entra nos KPIs acima
  const listaPesInd = pesInd || []
  const totalPesInd = listaPesInd.length
  const pesoMedioInd = totalPesInd ? listaPesInd.reduce((s, p) => s + Number(p.peso_kg || 0), 0) / totalPesInd : 0
  const semLotePesInd = listaPesInd.filter(p => !p.lote_id).length
  const prontosAbatePesInd = listaPesInd.filter(p => Number(p.peso_kg) > 300).length
  const baixoPesoPesInd = listaPesInd.filter(p => Number(p.peso_kg) < 100).length
  const dadosFaixaResumo = FAIXAS_PESO.map(f => ({
    rotulo: f.rotulo, cor: f.cor, sufixo: 'animais',
    valor: listaPesInd.filter(p => Number(p.peso_kg) >= f.min && Number(p.peso_kg) < f.max).length
  }))

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

    ${totalPesInd ? `
    <div class="cabeca-secao"><h3 style="font-size:16px;">Pesagem individual do rebanho</h3>
      <button class="btn-secundario mini" id="vg-ir-pesind">ver tela completa</button></div>
    <div class="resumo-topo">
      ${kpi('Animais pesados', fmtNum(totalPesInd, 0))}
      ${kpi('Peso médio', fmtNum(pesoMedioInd, 1) + ' kg')}
      ${kpi('Prontos p/ abate (>300kg)', fmtNum(prontosAbatePesInd, 0))}
      ${kpi('Sem lote atribuído', fmtNum(semLotePesInd, 0), semLotePesInd > 0 ? 'alerta' : '')}
    </div>
    ${baixoPesoPesInd > 0 ? `<div class="panel alerta" style="padding:12px 16px;margin-bottom:14px;"><p style="margin:0;font-size:12.5px;color:var(--warn-text);">⚠️ ${baixoPesoPesInd} animal(is) com peso abaixo de 100 kg — vale conferir.</p></div>` : ''}
    <div class="grade-graficos" style="margin-bottom:18px;">
      ${graficoBarrasCores('Distribuição por faixa de peso', dadosFaixaResumo)}
    </div>` : ''}

    <div class="cabeca-secao"><h3 style="font-size:16px;">Lotes ativos</h3></div>
    <div class="panel" style="padding:0;"><div class="tabela-scroll">
      <table><thead><tr><th>Lote</th><th class="num">Qtde</th><th>Status</th><th></th></tr></thead><tbody>
        ${lotesAtivos.length ? lotesAtivos.map(l => `<tr><td>${esc(l.nome)}</td><td class="num">${fmtNum(l.qtde_inicial, 0)}</td><td><span class="badge-bom">ativo</span></td>
          <td><button class="btn-secundario mini" data-ir-lotes>ver lotes</button></td></tr>`).join('')
          : '<tr><td colspan="4" class="vazio">Nenhum lote em confinamento.</td></tr>'}
      </tbody></table>
    </div></div>`

  area.querySelectorAll('[data-ir-lotes]').forEach(b => { b.onclick = () => irPara('lotes') })
  $('#vg-ir-pesind')?.addEventListener('click', () => {
    irPara('lotes')
    setTimeout(() => document.querySelector('.subabas button[data-sub="individual"]')?.click(), 50)
  })
}

// ==================================================================
// LOTES  (lista + criar/editar + detalhe com sub-abas)
// ==================================================================
async function paginaLotes () {
  $('#subtitulo-pagina').textContent = 'Cada lote é um grupo de animais — dele saem pesagem, trato, sanidade e receita'
  const area = $('#area')
  area.innerHTML = `
    <div class="subabas">
      <button data-sub="lista" class="ativo">Lotes</button>
      <button data-sub="peso">Peso do rebanho</button>
      <button data-sub="individual">Pesagem individual</button>
    </div>
    <div id="sub-lotes"></div>`
  area.querySelectorAll('.subabas button').forEach(b => {
    b.onclick = () => {
      area.querySelectorAll('.subabas button').forEach(x => x.classList.toggle('ativo', x === b))
      abrirSubLotes(b.dataset.sub)
    }
  })
  abrirSubLotes('lista')
}
function abrirSubLotes (sub) {
  const alvo = $('#sub-lotes')
  alvo.innerHTML = `<p class="texto-dim2">carregando...</p>`
  if (sub === 'lista') subListaLotes(alvo)
  if (sub === 'peso') subPesoRebanho(alvo)
  if (sub === 'individual') subPesagemIndividual(alvo)
}

async function subListaLotes (alvo) {
  const { data, error } = await db.from('fazenda_lote').select('*').order('data_entrada', { ascending: false })
  if (error) { alvo.innerHTML = `<p class="vazio">${esc(error.message)}</p>`; return }
  const lotes = data || []

  alvo.innerHTML = `
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

  if (PERFIL.editavel) $('#lt-novo').onclick = () => formLote(null, () => subListaLotes(alvo))
  alvo.querySelectorAll('[data-detalhe]').forEach(b => { b.onclick = () => paginaLoteDetalhe(b.dataset.detalhe) })
}

// ----- Peso do rebanho: distribuição por faixa + valor estimado por arroba -----
const FAIXAS_PESO = [
  { rotulo: '<100 kg', min: 0, max: 100, cor: '#c0392b' },
  { rotulo: '100-150 kg', min: 100, max: 150, cor: '#e08a3c' },
  { rotulo: '150-170 kg', min: 150, max: 170, cor: '#d9b21a' },
  { rotulo: '170-200 kg', min: 170, max: 200, cor: '#4fae5f' },
  { rotulo: '200-250 kg', min: 200, max: 250, cor: '#2f8f56' },
  { rotulo: '250-300 kg', min: 250, max: 300, cor: '#3e79b8' },
  { rotulo: '>300 kg', min: 300, max: Infinity, cor: '#8e5fc9' }
]
// preço e rendimento ficam fora da função pra sobreviver a re-render
const paramsArroba = { precoArroba: 333, rendimentoPct: 50 }

async function subPesoRebanho (alvo) {
  const [{ data: lotes }, { data: pesagens }] = await Promise.all([
    db.from('fazenda_lote').select('id,nome,pasto,status').eq('status', 'EM_CONFINAMENTO'),
    db.from('fazenda_pesagem').select('lote_id,data,qtde_pesada,peso_medio').order('data', { ascending: false })
  ])
  const lotesAtivos = lotes || []
  // pega só a pesagem mais recente de cada lote (a lista já vem ordenada por data desc)
  const ultimaPorLote = {}
  ;(pesagens || []).forEach(p => { if (!ultimaPorLote[p.lote_id]) ultimaPorLote[p.lote_id] = p })

  const linhas = lotesAtivos
    .map(l => ({ lote: l, pesagem: ultimaPorLote[l.id] }))
    .filter(x => x.pesagem)

  renderPesoRebanho(alvo, linhas)
}

function renderPesoRebanho (alvo, linhas) {
  const buckets = FAIXAS_PESO.map(f => ({ ...f, qtde: 0 }))
  let totalAnimais = 0, pesoVivoTotal = 0

  linhas.forEach(({ pesagem }) => {
    const qtde = Number(pesagem.qtde_pesada || 0)
    const peso = Number(pesagem.peso_medio || 0)
    totalAnimais += qtde
    pesoVivoTotal += qtde * peso
    const faixa = buckets.find(b => peso >= b.min && peso < b.max) || buckets[buckets.length - 1]
    faixa.qtde += qtde
  })

  const pesoMedioGeral = totalAnimais ? pesoVivoTotal / totalAnimais : 0
  const bucketAbate = buckets[buckets.length - 1] // >300kg
  const { precoArroba, rendimentoPct } = paramsArroba
  const arrobasTotais = pesoVivoTotal * (rendimentoPct / 100) / 15
  const valorTotalEstimado = arrobasTotais * precoArroba
  const arrobasAbate = bucketAbate.qtde && pesoVivoTotal ? (pesoVivoTotal / totalAnimais * bucketAbate.qtde) * (rendimentoPct / 100) / 15 : 0
  // valor estimado só do grupo pronto pra abate (usa peso médio geral do grupo >300 — aproximação, já que só temos peso médio por lote)
  const pesoMedioAbate = linhas.filter(x => Number(x.pesagem.peso_medio) >= 300)
    .reduce((acc, x, _, arr) => acc + Number(x.pesagem.peso_medio) / arr.length, 0) || 0
  const valorEstimadoAbate = bucketAbate.qtde * pesoMedioAbate * (rendimentoPct / 100) / 15 * precoArroba

  alvo.innerHTML = `
    <p class="texto-dim2" style="margin-bottom:14px;font-size:12.5px;">Baseado na pesagem mais recente de cada lote em confinamento (${linhas.length} de ${linhas.length} lote${linhas.length === 1 ? '' : 's'} com pesagem registrada). Cada barra soma a quantidade de animais dos lotes cuja média de peso cai naquela faixa.</p>

    <div class="resumo-topo">
      ${kpi('Animais considerados', fmtNum(totalAnimais, 0))}
      ${kpi('Peso vivo total', fmtNum(pesoVivoTotal, 0) + ' kg')}
      ${kpi('Peso médio geral', fmtNum(pesoMedioGeral, 1) + ' kg')}
      ${kpi('Valor estimado do rebanho', 'R$ ' + fmtNum(valorTotalEstimado, 0))}
    </div>

    <div class="grade-graficos">
      ${graficoBarrasCores('Distribuição por faixa de peso', buckets.map(b => ({ rotulo: b.rotulo, valor: b.qtde, cor: b.cor, sufixo: 'animais' })))}
      <div class="cartao-grafico">
        <h4>Prontos pra abate (>300 kg)</h4>
        ${bucketAbate.qtde ? `
          <div class="bloco alerta" style="margin-bottom:10px;"><div class="rot">Animais nessa faixa</div><div class="val">${fmtNum(bucketAbate.qtde, 0)}</div></div>
          <p class="texto-dim" style="font-size:12.5px;margin:0 0 4px;">Peso médio do grupo: <b>${fmtNum(pesoMedioAbate, 1)} kg</b></p>
          <p class="texto-dim" style="font-size:12.5px;margin:0 0 4px;">≈ ${fmtNum(arrobasAbate, 1)} arrobas de carcaça (rendimento ${rendimentoPct}%)</p>
          <p class="texto-dim" style="font-size:13px;margin:8px 0 0;">Valor estimado: <b style="color:var(--good-text);">R$ ${fmtNum(valorEstimadoAbate, 0)}</b></p>
        ` : `<p class="texto-dim2" style="font-size:12.5px;">Nenhum lote com média acima de 300 kg no momento.</p>`}
      </div>
    </div>

    <div class="panel" style="padding:16px 18px;margin-bottom:16px;">
      <div class="filtros">
        <div class="campo"><label>Preço da arroba (R$)</label><input id="pr-arroba" inputmode="decimal" value="${paramsArroba.precoArroba}"></div>
        <div class="campo"><label>Rendimento de carcaça (%)</label><input id="pr-rendimento" inputmode="decimal" value="${paramsArroba.rendimentoPct}"></div>
        <button class="btn-secundario" id="pr-recalcular">Recalcular</button>
      </div>
      <p class="texto-dim2" style="font-size:11px;margin:10px 0 0;">Referência: R$ 333/@ à vista, boi gordo no Tocantins (Sul e Norte) — Scot Consultoria, 12/08/2026. O preço muda todo dia, ajuste pra cotação do dia antes de decidir. Rendimento de carcaça padrão de 50% é uma estimativa comum pra zebuínos — o valor real só é confirmado na balança do frigorífico.</p>
    </div>

    ${linhas.length ? `<div class="panel" style="padding:0;"><div class="tabela-scroll">
      <table><thead><tr><th>Lote</th><th>Pasto</th><th>Última pesagem</th><th class="num">Qtde</th><th class="num">Peso médio</th><th class="num">GMD</th></tr></thead><tbody>
        ${linhas.map(({ lote, pesagem }) => `<tr>
          <td><b>${esc(lote.nome)}</b></td><td class="texto-dim">${esc(lote.pasto ?? '—')}</td>
          <td class="texto-dim2">${fmtData(pesagem.data)}</td><td class="num">${fmtNum(pesagem.qtde_pesada, 0)}</td>
          <td class="num">${fmtNum(pesagem.peso_medio, 1)} kg</td><td class="texto-dim2">${pesagem.gmd ? fmtNum(pesagem.gmd, 2) + ' kg/dia' : '—'}</td>
        </tr>`).join('')}
      </tbody></table>
    </div></div>` : `<p class="vazio">Nenhum lote em confinamento com pesagem registrada ainda.</p>`}`

  $('#pr-recalcular').onclick = () => {
    paramsArroba.precoArroba = numeroBR($('#pr-arroba').value) || 333
    paramsArroba.rendimentoPct = numeroBR($('#pr-rendimento').value) || 50
    renderPesoRebanho(alvo, linhas)
  }
}

// ----- Pesagem individual (por animal — brinco ou S/N), com filtros e
// atribuição de lote em massa pra quando a divisão por lote for conhecida -----
const filtroPesInd = { busca: '', faixa: '', lote: '' }
const selecaoPesInd = new Set()

async function subPesagemIndividual (alvo) {
  const [{ data: pesagens }, { data: lotes }] = await Promise.all([
    db.from('fazenda_pesagem_individual').select('*, lote:lote_id(nome)').order('peso_kg', { ascending: false }),
    db.from('fazenda_lote').select('id,nome').order('nome')
  ])
  window.__FAZENDA_PESAGENS_IND = pesagens || []
  window.__FAZENDA_LOTES_FILTRO = lotes || []
  renderPesagemIndividual(alvo)
}

function renderPesagemIndividual (alvo) {
  const todos = window.__FAZENDA_PESAGENS_IND || []
  const lotes = window.__FAZENDA_LOTES_FILTRO || []

  let lista = todos
  if (filtroPesInd.busca.trim()) {
    const termo = filtroPesInd.busca.trim().toLowerCase()
    lista = lista.filter(p => (p.id_brinco || '').toLowerCase().includes(termo) || (p.id_sn || '').toLowerCase().includes(termo))
  }
  if (filtroPesInd.faixa) {
    const f = FAIXAS_PESO.find(x => x.rotulo === filtroPesInd.faixa)
    if (f) lista = lista.filter(p => Number(p.peso_kg) >= f.min && Number(p.peso_kg) < f.max)
  }
  if (filtroPesInd.lote === '__sem_lote__') lista = lista.filter(p => !p.lote_id)
  else if (filtroPesInd.lote) lista = lista.filter(p => p.lote_id === filtroPesInd.lote)

  const pesos = lista.map(p => Number(p.peso_kg)).sort((a, b) => a - b)
  const total = pesos.length
  const soma = pesos.reduce((s, p) => s + p, 0)
  const media = total ? soma / total : 0
  const maximo = total ? pesos[total - 1] : 0
  const minimo = total ? pesos[0] : 0
  const variancia = total ? pesos.reduce((s, p) => s + (p - media) ** 2, 0) / total : 0
  const desvio = Math.sqrt(variancia)
  const percentil = p => total ? pesos[Math.min(total - 1, Math.floor(p / 100 * total))] : 0
  const q1 = percentil(25), mediana = percentil(50), q3 = percentil(75)
  const comBrinco = lista.filter(p => p.tipo_identificacao === 'Brinco').length
  const semId = lista.filter(p => p.tipo_identificacao === 'S/N').length
  const baixoPeso = lista.filter(p => Number(p.peso_kg) < 100).length
  const altoPeso = lista.filter(p => Number(p.peso_kg) > 300).length

  // histograma de 50 em 50 kg
  const binsHist = [[0, 50], [50, 100], [100, 150], [150, 200], [200, 250], [250, 300], [300, 350], [350, Infinity]]
  const dadosHist = binsHist.map(([min, max]) => ({
    rotulo: max === Infinity ? '350+' : `${min}-${max}`,
    valor: lista.filter(p => Number(p.peso_kg) >= min && Number(p.peso_kg) < max).length
  }))

  // distribuição por faixa (mesmas 7 faixas usadas no Peso do rebanho)
  const dadosFaixa = FAIXAS_PESO.map(f => ({
    rotulo: f.rotulo, cor: f.cor, sufixo: 'animais',
    valor: lista.filter(p => Number(p.peso_kg) >= f.min && Number(p.peso_kg) < f.max).length
  }))

  // distribuição cumulativa — 12 pontos ao longo dos pesos ordenados
  const pontosCumulativa = []
  const nPontos = Math.min(12, total || 1)
  for (let i = 0; i < nPontos; i++) {
    const idx = Math.round(i / (nPontos - 1 || 1) * (total - 1))
    pontosCumulativa.push({ xRotulo: fmtNum(pesos[idx] ?? 0, 0), y: total ? (idx + 1) / total * 100 : 0 })
  }

  alvo.innerHTML = `
    <div class="panel" style="padding:16px 18px;margin-bottom:16px;">
      <div class="filtros">
        <div class="campo" style="min-width:200px;"><label>Buscar por brinco/ID</label><input id="pi-busca" value="${esc(filtroPesInd.busca)}" placeholder="digite o brinco ou SN..."></div>
        <div class="campo"><label>Faixa de peso</label><select id="pi-faixa"><option value="">Todas as faixas</option>
          ${FAIXAS_PESO.map(f => `<option value="${esc(f.rotulo)}" ${filtroPesInd.faixa === f.rotulo ? 'selected' : ''}>${esc(f.rotulo)}</option>`).join('')}</select></div>
        <div class="campo"><label>Lote</label><select id="pi-lote"><option value="">Todos</option>
          <option value="__sem_lote__" ${filtroPesInd.lote === '__sem_lote__' ? 'selected' : ''}>Sem lote atribuído</option>
          ${lotes.map(l => `<option value="${l.id}" ${filtroPesInd.lote === l.id ? 'selected' : ''}>${esc(l.nome)}</option>`).join('')}</select></div>
        <button class="btn-secundario" id="pi-limpar">Limpar filtros</button>
      </div>
    </div>

    <div class="resumo-topo">
      ${kpi('Total de animais', fmtNum(total, 0))}
      ${kpi('Peso médio', fmtNum(media, 1) + ' kg', '')}
      ${kpi('Peso máximo', fmtNum(maximo, 0) + ' kg')}
      ${kpi('Desvio padrão', fmtNum(desvio, 1) + ' kg')}
    </div>
    <div class="resumo-topo">
      ${kpi('3º Quartil (75%)', fmtNum(q3, 0) + ' kg')}
      ${kpi('1º Quartil (25%)', fmtNum(q1, 0) + ' kg')}
      ${kpi('Baixo peso (<100 kg)', fmtNum(baixoPeso, 0), baixoPeso > 0 ? 'alerta' : '')}
      ${kpi('Alto peso (>300 kg)', fmtNum(altoPeso, 0))}
    </div>

    <div class="grade-graficos">
      ${graficoBarrasCores('Distribuição de peso (histograma)', dadosHist.map(d => ({ ...d, cor: 'var(--good-text)', sufixo: 'animais' })))}
      ${graficoBarrasCores('Distribuição por faixa de peso', dadosFaixa)}
    </div>
    <div class="grade-graficos">
      ${graficoDonut('Identificação dos animais', [
        { rotulo: 'Com brinco', valor: comBrinco, cor: 'var(--good-text)' },
        { rotulo: 'Sem ID (S/N)', valor: semId, cor: 'var(--warn-text)' }
      ])}
      ${graficoLinha('Distribuição cumulativa de peso', pontosCumulativa)}
    </div>

    ${PERFIL.editavel ? `<div class="acoes" style="margin-bottom:16px;"><button class="btn" id="pi-novo">+ Nova pesagem</button></div>` : ''}

    ${PERFIL.editavel ? `<div class="panel" style="padding:14px 18px;margin-bottom:16px;">
      <div class="filtros">
        <span class="texto-dim2" style="font-size:12.5px;">${selecaoPesInd.size} selecionado(s)</span>
        <div class="campo"><label>Atribuir ao lote</label><select id="pi-atribuir-lote"><option value="">Escolha um lote</option>
          ${lotes.map(l => `<option value="${l.id}">${esc(l.nome)}</option>`).join('')}</select></div>
        <button class="btn" id="pi-atribuir-aplicar">Aplicar aos selecionados</button>
        <button class="btn-secundario" id="pi-selecionar-todos">Selecionar todos os filtrados (${lista.length})</button>
        <button class="btn-secundario" id="pi-limpar-selecao">Limpar seleção</button>
      </div>
    </div>` : ''}

    <div class="panel" style="padding:0;"><div class="tabela-scroll">
      <table><thead><tr>${PERFIL.editavel ? '<th></th>' : ''}<th>Identificação</th><th>Tipo</th><th class="num">Peso</th><th>Faixa</th><th>Lote/pasto</th>${PERFIL.editavel ? '<th></th>' : ''}</tr></thead><tbody>
        ${lista.slice(0, 500).map(p => `<tr>
          ${PERFIL.editavel ? `<td><input type="checkbox" class="pi-check" data-id="${p.id}" ${selecaoPesInd.has(p.id) ? 'checked' : ''}></td>` : ''}
          <td><b>${esc(p.id_brinco || p.id_sn || '—')}</b></td>
          <td>${p.tipo_identificacao === 'Brinco' ? '<span class="badge-bom">Brinco</span>' : '<span class="chip">S/N</span>'}</td>
          <td class="num">${fmtNum(p.peso_kg, 1)} kg</td>
          <td class="texto-dim2">${esc((FAIXAS_PESO.find(f => Number(p.peso_kg) >= f.min && Number(p.peso_kg) < f.max) || {}).rotulo ?? '—')}</td>
          <td class="texto-dim">${p.lote?.nome ? esc(p.lote.nome) : '<span class="texto-dim2">sem lote</span>'}</td>
          ${PERFIL.editavel ? `<td><button class="btn-secundario mini" data-editar-pi="${p.id}">editar</button></td>` : ''}
        </tr>`).join('') || `<tr><td colspan="${PERFIL.editavel ? 7 : 5}" class="vazio">Nenhum animal encontrado com esse filtro.</td></tr>`}
      </tbody></table>
      ${lista.length > 500 ? `<p class="texto-dim2" style="padding:12px 16px;font-size:11.5px;">Mostrando os primeiros 500 de ${lista.length} — refine o filtro pra ver o resto.</p>` : ''}
    </div></div>`

  $('#pi-busca').oninput = (() => {
    let t
    return () => { clearTimeout(t); t = setTimeout(() => { filtroPesInd.busca = $('#pi-busca').value; renderPesagemIndividual(alvo) }, 300) }
  })()
  $('#pi-faixa').onchange = () => { filtroPesInd.faixa = $('#pi-faixa').value; renderPesagemIndividual(alvo) }
  $('#pi-lote').onchange = () => { filtroPesInd.lote = $('#pi-lote').value; renderPesagemIndividual(alvo) }
  $('#pi-limpar').onclick = () => { filtroPesInd.busca = ''; filtroPesInd.faixa = ''; filtroPesInd.lote = ''; renderPesagemIndividual(alvo) }

  if (PERFIL.editavel) {
    $('#pi-novo').onclick = () => formPesagemIndividual(null, () => subPesagemIndividual(alvo))
    alvo.querySelectorAll('[data-editar-pi]').forEach(b => {
      b.onclick = () => formPesagemIndividual(todos.find(x => x.id === b.dataset.editarPi), () => subPesagemIndividual(alvo))
    })
    alvo.querySelectorAll('.pi-check').forEach(cb => {
      cb.onchange = () => { cb.checked ? selecaoPesInd.add(cb.dataset.id) : selecaoPesInd.delete(cb.dataset.id); renderPesagemIndividual(alvo) }
    })
    $('#pi-selecionar-todos').onclick = () => { lista.forEach(p => selecaoPesInd.add(p.id)); renderPesagemIndividual(alvo) }
    $('#pi-limpar-selecao').onclick = () => { selecaoPesInd.clear(); renderPesagemIndividual(alvo) }
    $('#pi-atribuir-aplicar').onclick = async () => {
      const loteId = $('#pi-atribuir-lote').value
      if (!loteId) { alert('Escolha um lote antes de aplicar.'); return }
      if (!selecaoPesInd.size) { alert('Selecione ao menos um animal.'); return }
      const btn = $('#pi-atribuir-aplicar'); btn.disabled = true; btn.textContent = 'Aplicando...'
      const { error } = await db.from('fazenda_pesagem_individual').update({ lote_id: loteId }).in('id', [...selecaoPesInd])
      btn.disabled = false; btn.textContent = 'Aplicar aos selecionados'
      if (error) { alert('Não deu pra atribuir: ' + error.message); return }
      selecaoPesInd.clear()
      subPesagemIndividual(alvo)
    }
  }
}

function formPesagemIndividual (registro, aoSalvar) {
  const lotes = window.__FAZENDA_LOTES_FILTRO || []
  const fundo = document.createElement('div')
  fundo.className = 'modal-fundo'
  fundo.innerHTML = `<div class="modal">
    <h3>${registro ? 'Editar' : 'Nova'} pesagem individual</h3>
    <div class="form-grade">
      <div class="campo"><label>Tipo de identificação</label><select id="fpi-tipo">
        <option value="Brinco" ${(!registro || registro.tipo_identificacao === 'Brinco') ? 'selected' : ''}>Brinco</option>
        <option value="S/N" ${registro?.tipo_identificacao === 'S/N' ? 'selected' : ''}>S/N (sem identificação)</option>
      </select></div>
      <div class="campo" id="fpi-campo-brinco"><label>Nº do brinco</label><input id="fpi-brinco" value="${esc(registro?.id_brinco ?? '')}" placeholder="ex: 964 001060572846"></div>
      <div class="campo" id="fpi-campo-sn"><label>Identificação S/N</label><input id="fpi-sn" value="${esc(registro?.id_sn ?? '')}" placeholder="ex: SN_0042"></div>
      <div class="campo"><label>Peso (kg) *</label><input id="fpi-peso" inputmode="decimal" value="${registro?.peso_kg ?? ''}"></div>
      <div class="campo"><label>Data</label><input type="date" id="fpi-data" value="${registro?.data ?? hojeISO()}"></div>
      <div class="campo"><label>Lote/pasto</label><select id="fpi-lote"><option value="">— sem lote —</option>
        ${lotes.map(l => `<option value="${l.id}" ${registro?.lote_id === l.id ? 'selected' : ''}>${esc(l.nome)}</option>`).join('')}</select></div>
    </div>
    <div class="campo" style="margin-top:10px;"><label>Observações</label><textarea id="fpi-obs" style="min-height:56px;">${esc(registro?.observacoes ?? '')}</textarea></div>
    <div class="acoes" style="margin-top:14px;">
      <button class="btn" id="fpi-salvar">Salvar</button>
      ${registro ? `<button class="btn-secundario" id="fpi-excluir" style="color:var(--warn-text);">Excluir</button>` : ''}
      <button class="btn-secundario" id="fpi-fechar">Fechar</button>
    </div>
    <div class="recado oculto" id="fpi-recado"></div>
  </div>`
  document.body.appendChild(fundo)
  const fechar = () => fundo.remove()
  fundo.querySelector('#fpi-fechar').onclick = fechar
  fundo.onclick = e => { if (e.target === fundo) fechar() }

  const alternarTipo = () => {
    const ehBrinco = fundo.querySelector('#fpi-tipo').value === 'Brinco'
    fundo.querySelector('#fpi-campo-brinco').style.display = ehBrinco ? '' : 'none'
    fundo.querySelector('#fpi-campo-sn').style.display = ehBrinco ? 'none' : ''
  }
  fundo.querySelector('#fpi-tipo').onchange = alternarTipo
  alternarTipo()

  const el = fundo.querySelector('#fpi-recado')
  const aviso = t => { el.textContent = t; el.classList.remove('oculto'); el.style.borderColor = 'var(--warn-text)'; el.style.color = 'var(--warn-text)' }

  if (registro) {
    fundo.querySelector('#fpi-excluir').onclick = async () => {
      if (!confirm('Excluir essa pesagem? Não tem como desfazer.')) return
      const btn = fundo.querySelector('#fpi-excluir'); btn.disabled = true; btn.textContent = 'Excluindo...'
      const { error } = await db.from('fazenda_pesagem_individual').delete().eq('id', registro.id)
      if (error) { btn.disabled = false; btn.textContent = 'Excluir'; aviso(error.message); return }
      fechar(); aoSalvar()
    }
  }

  fundo.querySelector('#fpi-salvar').onclick = async () => {
    const tipo = fundo.querySelector('#fpi-tipo').value
    const brinco = fundo.querySelector('#fpi-brinco').value.trim()
    const sn = fundo.querySelector('#fpi-sn').value.trim()
    const peso = numeroBR(fundo.querySelector('#fpi-peso').value)
    if (tipo === 'Brinco' && !brinco) { aviso('Informe o número do brinco.'); return }
    if (tipo === 'S/N' && !sn) { aviso('Informe a identificação S/N.'); return }
    if (peso === null || peso <= 0) { aviso('Informe o peso.'); return }
    const btn = fundo.querySelector('#fpi-salvar'); btn.disabled = true; btn.textContent = 'Salvando...'
    const corpo = {
      tipo_identificacao: tipo, id_brinco: tipo === 'Brinco' ? brinco : null, id_sn: tipo === 'S/N' ? sn : null,
      peso_kg: peso, data: fundo.querySelector('#fpi-data').value || hojeISO(),
      lote_id: fundo.querySelector('#fpi-lote').value || null,
      observacoes: fundo.querySelector('#fpi-obs').value.trim() || null
    }
    let error
    if (registro) { ({ error } = await db.from('fazenda_pesagem_individual').update(corpo).eq('id', registro.id)) }
    else { ({ error } = await db.from('fazenda_pesagem_individual').insert({ ...corpo, criado_por: PERFIL.pessoaId })) }
    btn.disabled = false; btn.textContent = 'Salvar'
    if (error) { aviso(error.message); return }
    fechar(); aoSalvar()
  }
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
          centro_custo_id: FAZENDA_CENTRO_CUSTO_ID, valor, situacao: 'PENDENTE',
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
  $('#subtitulo-pagina').textContent = 'Despesas e receitas da fazenda — anexo de comprovante, fornecedor e situação de pagamento'
  const area = $('#area')
  area.innerHTML = `<div id="sub-fin"></div>`
  subLancamentos($('#sub-fin'))
}

// filtro fica fora da função pra sobreviver a re-render (troca de mês/situação/busca)
const filtroFin = { mes: hojeISO().slice(0, 7), situacao: '', busca: '' }

async function subLancamentos (alvo) {
  const [{ data: contas }, { data: categorias }, { data: funcionarios }, { data: fornecedores }] = await Promise.all([
    db.from('conta_financeira').select('id,nome').order('nome'),
    db.from('categoria_financeira').select('id,nome').order('nome'),
    db.from('fazenda_funcionario').select('id,nome').eq('ativo', true).order('nome'),
    db.from('fazenda_fornecedor').select('id,nome').eq('ativo', true).order('nome')
  ])
  window.__FAZENDA_CONTAS = contas || []
  window.__FAZENDA_CATEGORIAS = categorias || []
  window.__FAZENDA_FUNCIONARIOS = funcionarios || []
  window.__FAZENDA_FORNECEDORES = fornecedores || []
  await carregarLancamentos(alvo)
}

async function carregarLancamentos (alvo) {
  alvo.innerHTML = `<p class="texto-dim2">carregando...</p>`

  const [ano, mes] = filtroFin.mes.split('-').map(Number)
  const dIni = `${filtroFin.mes}-01`
  const dFim = new Date(ano, mes, 0).toISOString().slice(0, 10) // último dia do mês escolhido

  let query = db.from('lancamento_financeiro')
    .select('*, conta:conta_id(nome), categoria:categoria_id(nome), funcionario:fazenda_funcionario_id(nome), fornecedor:fornecedor_id(nome)')
    .eq('centro_custo_id', FAZENDA_CENTRO_CUSTO_ID)
    .gte('data_lancamento', dIni).lte('data_lancamento', dFim)
  if (filtroFin.situacao) query = query.eq('situacao', filtroFin.situacao)
  const { data: lancs, error } = await query.order('data_lancamento', { ascending: false }).limit(500)
  if (error) { alvo.innerHTML = `<p class="vazio">${esc(error.message)}</p>`; return }

  let lista = lancs || []
  if (filtroFin.busca.trim()) {
    const termo = filtroFin.busca.trim().toLowerCase()
    lista = lista.filter(l =>
      (l.descricao || '').toLowerCase().includes(termo) ||
      (l.fornecedor?.nome || '').toLowerCase().includes(termo) ||
      (l.funcionario?.nome || '').toLowerCase().includes(termo) ||
      (l.categoria?.nome || '').toLowerCase().includes(termo))
  }

  const despesasArr = lista.filter(l => l.tipo === 'SAIDA')
  const receitasArr = lista.filter(l => l.tipo === 'ENTRADA')
  const despesas = despesasArr.reduce((s, l) => s + Number(l.valor || 0), 0)
  const receitas = receitasArr.reduce((s, l) => s + Number(l.valor || 0), 0)
  const despesasPagas = despesasArr.filter(l => l.situacao === 'EFETIVADO').reduce((s, l) => s + Number(l.valor || 0), 0)
  const despesasPendentes = despesas - despesasPagas

  const porCategoria = {}
  despesasArr.forEach(l => {
    const nome = l.categoria?.nome || 'Sem categoria'
    porCategoria[nome] = (porCategoria[nome] || 0) + Number(l.valor || 0)
  })
  const dadosCategoria = Object.entries(porCategoria).map(([rotulo, valor]) => ({ rotulo, valor })).sort((a, b) => b.valor - a.valor).slice(0, 8)

  const [anoTit, mesTit] = filtroFin.mes.split('-')
  const nomeMes = new Date(Number(anoTit), Number(mesTit) - 1, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })

  alvo.innerHTML = `
    <div class="resumo-topo">
      ${kpi('Despesas em ' + nomeMes, 'R$ ' + fmtNum(despesas))}
      ${kpi('Receitas em ' + nomeMes, 'R$ ' + fmtNum(receitas))}
      ${kpi('Resultado', 'R$ ' + fmtNum(receitas - despesas))}
      ${kpi('Despesas pendentes', 'R$ ' + fmtNum(despesasPendentes), despesasPendentes > 0 ? 'alerta' : '')}
    </div>

    <div class="grade-graficos">
      ${graficoBarras('Despesas por categoria', dadosCategoria)}
      ${graficoPagoPendente('Despesas — pago x pendente', despesasPagas, despesasPendentes)}
    </div>

    <div class="panel" style="padding:16px 18px;margin-bottom:16px;">
      <div class="filtros">
        <div class="campo"><label>Mês</label><input type="month" id="fin-f-mes" value="${filtroFin.mes}"></div>
        <div class="campo"><label>Situação</label><select id="fin-f-sit">
          <option value="">Todas</option>
          <option value="EFETIVADO" ${filtroFin.situacao === 'EFETIVADO' ? 'selected' : ''}>Pago</option>
          <option value="PENDENTE" ${filtroFin.situacao === 'PENDENTE' ? 'selected' : ''}>Pendente</option>
        </select></div>
        <div class="campo" style="min-width:220px;"><label>Buscar por nome/descrição/categoria</label><input id="fin-f-busca" value="${esc(filtroFin.busca)}" placeholder="ex: veterinário, ração..."></div>
      </div>
    </div>

    ${PERFIL.editavel ? `<div class="acoes" style="margin-bottom:16px;"><button class="btn" id="fin-novo">+ Novo lançamento</button></div>` : ''}
    <div class="panel" style="padding:0;"><div class="tabela-scroll">
      <table><thead><tr><th>Data</th><th>Tipo</th><th>Categoria</th><th>Fornecedor</th><th>Descrição</th><th class="num">Valor</th><th>Situação</th><th>Comprovante</th>${PERFIL.editavel ? '<th></th>' : ''}</tr></thead><tbody>
        ${lista.map(l => `<tr>
          <td class="texto-dim2">${fmtData(l.data_lancamento)}</td>
          <td>${l.tipo === 'SAIDA' ? '<span class="badge-alerta">Saída</span>' : '<span class="badge-bom">Entrada</span>'}</td>
          <td class="texto-dim2">${esc(l.categoria?.nome ?? '—')}</td>
          <td class="texto-dim">${esc(l.fornecedor?.nome ?? l.funcionario?.nome ?? '—')}</td>
          <td>${esc(l.descricao ?? '—')}</td><td class="num">R$ ${fmtNum(l.valor)}</td>
          <td>${l.situacao === 'EFETIVADO'
              ? `<span class="badge-bom">pago${l.data_pagamento ? ' ' + fmtData(l.data_pagamento) : ''}</span>`
              : (PERFIL.editavel ? `<button class="btn-secundario mini" data-marcar-pago="${l.id}">marcar pago</button>` : '<span class="chip">pendente</span>')}</td>
          <td>${l.comprovante_caminho ? `<button class="btn-secundario mini" data-abrir-comp="${esc(l.comprovante_caminho)}">📎 ver</button>` : '<span class="texto-dim2">—</span>'}</td>
          ${PERFIL.editavel ? `<td style="white-space:nowrap;"><button class="btn-secundario mini" data-editar-lanc="${l.id}">editar</button> <button class="btn-secundario mini" data-excluir-lanc="${l.id}">excluir</button></td>` : ''}
        </tr>`).join('') || `<tr><td colspan="${PERFIL.editavel ? 9 : 8}" class="vazio">Nenhum lançamento nesse período/filtro.</td></tr>`}
      </tbody></table>
    </div></div>`

  $('#fin-f-mes').onchange = () => { filtroFin.mes = $('#fin-f-mes').value; carregarLancamentos(alvo) }
  $('#fin-f-sit').onchange = () => { filtroFin.situacao = $('#fin-f-sit').value; carregarLancamentos(alvo) }
  let temporizadorBusca
  $('#fin-f-busca').oninput = () => {
    clearTimeout(temporizadorBusca)
    temporizadorBusca = setTimeout(() => { filtroFin.busca = $('#fin-f-busca').value; carregarLancamentos(alvo) }, 350)
  }

  alvo.querySelectorAll('[data-abrir-comp]').forEach(b => { b.onclick = () => abrirArquivo(b.dataset.abrirComp) })

  if (PERFIL.editavel) {
    $('#fin-novo').onclick = () => formLancamento(null, () => carregarLancamentos(alvo))
    alvo.querySelectorAll('[data-editar-lanc]').forEach(b => {
      b.onclick = () => formLancamento(lista.find(x => x.id === b.dataset.editarLanc), () => carregarLancamentos(alvo))
    })
    alvo.querySelectorAll('[data-excluir-lanc]').forEach(b => {
      b.onclick = async () => {
        if (!confirm('Excluir este lançamento? Não tem como desfazer.')) return
        const { error } = await db.from('lancamento_financeiro').delete().eq('id', b.dataset.excluirLanc)
        if (error) { alert('Não deu pra excluir: ' + error.message); return }
        carregarLancamentos(alvo)
      }
    })
    alvo.querySelectorAll('[data-marcar-pago]').forEach(b => {
      b.onclick = async () => {
        const { error } = await db.from('lancamento_financeiro').update({ situacao: 'EFETIVADO', data_pagamento: hojeISO() }).eq('id', b.dataset.marcarPago)
        if (error) { alert('Não deu pra marcar como pago: ' + error.message); return }
        carregarLancamentos(alvo)
      }
    })
  }
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

function formLancamento (registro, aoSalvar) {
  const contas = window.__FAZENDA_CONTAS || []
  const categorias = window.__FAZENDA_CATEGORIAS || []
  const funcionarios = window.__FAZENDA_FUNCIONARIOS || []
  const fornecedores = window.__FAZENDA_FORNECEDORES || []
  const fundo = document.createElement('div')
  fundo.className = 'modal-fundo'
  fundo.innerHTML = `<div class="modal">
    <h3>${registro ? 'Editar' : 'Novo'} lançamento financeiro</h3>
    <div class="form-grade">
      <div class="campo"><label>Data *</label><input type="date" id="fn-data" value="${registro?.data_lancamento ?? hojeISO()}"></div>
      <div class="campo"><label>Tipo</label><select id="fn-tipo">
        <option value="SAIDA" ${(!registro || registro.tipo === 'SAIDA') ? 'selected' : ''}>Saída (despesa)</option>
        <option value="ENTRADA" ${registro?.tipo === 'ENTRADA' ? 'selected' : ''}>Entrada (receita)</option></select></div>
      <div class="campo"><label>Categoria</label><select id="fn-categoria"><option value="">—</option>${categorias.map(c => `<option value="${c.id}" ${registro?.categoria_id === c.id ? 'selected' : ''}>${esc(c.nome)}</option>`).join('')}</select></div>
      <div class="campo"><label>Conta</label><select id="fn-conta"><option value="">—</option>${contas.map(c => `<option value="${c.id}" ${registro?.conta_id === c.id ? 'selected' : ''}>${esc(c.nome)}</option>`).join('')}</select></div>
      <div class="campo"><label>Fornecedor (opcional)</label><select id="fn-fornecedor"><option value="">—</option>${fornecedores.map(f => `<option value="${f.id}" ${registro?.fornecedor_id === f.id ? 'selected' : ''}>${esc(f.nome)}</option>`).join('')}</select></div>
      <div class="campo"><label>Funcionário/prestador (opcional)</label><select id="fn-funcionario"><option value="">—</option>${funcionarios.map(f => `<option value="${f.id}" ${registro?.fazenda_funcionario_id === f.id ? 'selected' : ''}>${esc(f.nome)}</option>`).join('')}</select></div>
      <div class="campo"><label>Valor (R$) *</label><input id="fn-valor" inputmode="decimal" value="${registro?.valor ?? ''}"></div>
      <div class="campo"><label>Situação</label><select id="fn-situacao">
        <option value="PENDENTE" ${(!registro || registro.situacao === 'PENDENTE') ? 'selected' : ''}>Pendente</option>
        <option value="EFETIVADO" ${registro?.situacao === 'EFETIVADO' ? 'selected' : ''}>Pago</option></select></div>
      <div class="campo" id="fn-campo-data-pagto"><label>Data do pagamento</label><input type="date" id="fn-data-pagto" value="${registro?.data_pagamento ?? ''}"></div>
    </div>
    <div class="campo" style="margin-top:10px;"><label>Descrição *</label><input id="fn-descricao" value="${esc(registro?.descricao ?? '')}"></div>
    <div class="campo" style="margin-top:10px;"><label>Observação</label><textarea id="fn-obs" style="min-height:60px;">${esc(registro?.observacao ?? '')}</textarea></div>
    <div class="campo" style="margin-top:10px;"><label>Comprovante (nota, boleto, recibo...)</label>
      <input type="file" id="fn-comprovante">
      ${registro?.comprovante_caminho ? `<div class="recado" style="margin-top:8px;">Anexo atual: <b>${esc(registro.comprovante_nome ?? 'comprovante')}</b> —
        <button type="button" class="btn-secundario mini" id="fn-ver-comp">ver</button>
        <label style="margin-left:8px;font-weight:400;"><input type="checkbox" id="fn-remover-comp"> remover anexo</label></div>` : ''}
    </div>
    <div class="acoes" style="margin-top:14px;"><button class="btn" id="fn-salvar">Salvar</button>
      <button class="btn-secundario" id="fn-fechar">Fechar</button></div>
    <div class="recado oculto" id="fn-recado"></div>
  </div>`
  document.body.appendChild(fundo)
  const fechar = () => fundo.remove()
  fundo.querySelector('#fn-fechar').onclick = fechar
  fundo.onclick = e => { if (e.target === fundo) fechar() }
  fundo.querySelector('#fn-ver-comp')?.addEventListener('click', () => abrirArquivo(registro.comprovante_caminho))

  const alternarDataPagto = () => {
    fundo.querySelector('#fn-campo-data-pagto').style.display = fundo.querySelector('#fn-situacao').value === 'EFETIVADO' ? '' : 'none'
  }
  fundo.querySelector('#fn-situacao').onchange = alternarDataPagto
  alternarDataPagto()

  fundo.querySelector('#fn-salvar').onclick = async () => {
    const el = fundo.querySelector('#fn-recado')
    const aviso = t => { el.textContent = t; el.classList.remove('oculto'); el.style.borderColor = 'var(--warn-text)'; el.style.color = 'var(--warn-text)' }
    const descricao = fundo.querySelector('#fn-descricao').value.trim()
    const valor = numeroBR(fundo.querySelector('#fn-valor').value)
    if (!descricao) { aviso('Escreva a descrição.'); return }
    if (valor === null || valor <= 0) { aviso('Informe o valor.'); return }
    const situacao = fundo.querySelector('#fn-situacao').value
    const btn = fundo.querySelector('#fn-salvar'); btn.disabled = true; btn.textContent = 'Salvando...'

    let comprovanteCaminho = registro?.comprovante_caminho ?? null
    let comprovanteNome = registro?.comprovante_nome ?? null
    const removerComp = fundo.querySelector('#fn-remover-comp')?.checked
    if (removerComp) { comprovanteCaminho = null; comprovanteNome = null }
    const arquivoComp = fundo.querySelector('#fn-comprovante').files[0]
    if (arquivoComp) {
      try {
        const enviado = await enviarArquivo(arquivoComp, 'fazenda-despesas-comprovantes')
        comprovanteCaminho = enviado.caminho; comprovanteNome = enviado.nome
      } catch (e) { aviso('Não deu pra enviar o comprovante: ' + e.message); btn.disabled = false; btn.textContent = 'Salvar'; return }
    }

    const corpo = {
      data_lancamento: fundo.querySelector('#fn-data').value, tipo: fundo.querySelector('#fn-tipo').value,
      categoria_id: fundo.querySelector('#fn-categoria').value || null, conta_id: fundo.querySelector('#fn-conta').value || null,
      fornecedor_id: fundo.querySelector('#fn-fornecedor').value || null,
      fazenda_funcionario_id: fundo.querySelector('#fn-funcionario').value || null,
      valor, situacao, data_pagamento: situacao === 'EFETIVADO' ? (fundo.querySelector('#fn-data-pagto').value || hojeISO()) : null,
      descricao, observacao: fundo.querySelector('#fn-obs').value.trim() || null,
      comprovante_caminho: comprovanteCaminho, comprovante_nome: comprovanteNome
    }
    let error
    if (registro) { ({ error } = await db.from('lancamento_financeiro').update(corpo).eq('id', registro.id)) }
    else { ({ error } = await db.from('lancamento_financeiro').insert({ ...corpo, centro_custo_id: FAZENDA_CENTRO_CUSTO_ID, registrado_por: PERFIL.pessoaId })) }
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
      <table><thead><tr><th>Quando</th><th>Produto/serviço</th><th class="num">Qtde</th><th>Status</th><th class="num">Valor estimado</th><th></th></tr></thead><tbody>
        ${lista.map(s => `<tr>
          <td class="texto-dim2">${fmtQuando(s.criado_em)}</td>
          <td>${esc(s.produto_servico)}</td>
          <td class="num">${s.quantidade ?? '—'} ${esc(s.unidade ?? '')}</td>
          <td><span class="${corStatus(s.status)}">${esc(ROTULO_STATUS[s.status] ?? s.status)}</span></td>
          <td class="num">${s.valor_estimado ? 'R$ ' + fmtNum(s.valor_estimado) : '—'}</td>
          <td>${s.anexo_url ? `<button class="btn-secundario mini" data-abrir-anexo-cp="${esc(s.anexo_url)}">📎</button>` : '—'}</td>
        </tr>`).join('') || `<tr><td colspan="6" class="vazio">Nenhuma solicitação de compra ainda.</td></tr>`}
      </tbody></table>
    </div></div>`

  area.querySelectorAll('[data-abrir-anexo-cp]').forEach(b => { b.onclick = () => abrirArquivo(b.dataset.abrirAnexoCp) })
  $('#cp-novo').onclick = () => formCompraFazenda(() => paginaCompras())
}

function formCompraFazenda (aoSalvar) {
  const fundo = document.createElement('div')
  fundo.className = 'modal-fundo'
  fundo.innerHTML = `<div class="modal">
    <h3>Nova solicitação de compra</h3>
    <div class="form-grade">
      <div class="campo"><label>Urgência</label><select id="cp-urg">
        <option value="NAO_URGENTE_5D">Normal — 5 dias</option><option value="URGENTE_4H">Urgente — 4 horas</option></select></div>
      <div class="campo"><label>Valor estimado total (R$)</label><input id="cp-valor" inputmode="decimal"></div>
      <div class="campo" style="grid-column:span 2;"><label>Local de entrega</label><input id="cp-local" placeholder="Fazenda Ouro Branco"></div>
    </div>
    <div class="cabeca-secao" style="margin-top:14px;">
      <h4 style="font-size:13px;margin:0;">Produtos/serviços</h4>
      <button class="btn-secundario mini" id="cp-add-item" type="button">+ item</button>
    </div>
    <div id="cp-itens"></div>
    <div class="campo" style="margin-top:12px;"><label>Anexo (cotação, ficha técnica, print...)</label>
      <input type="file" id="cp-anexo"></div>
    <div class="acoes" style="margin-top:14px;"><button class="btn" id="cp-salvar">Enviar solicitação</button>
      <button class="btn-secundario" id="cp-fechar">Fechar</button></div>
    <div class="recado oculto" id="cp-recado"></div>
  </div>`
  document.body.appendChild(fundo)
  const fechar = () => fundo.remove()
  fundo.querySelector('#cp-fechar').onclick = fechar
  fundo.onclick = e => { if (e.target === fundo) fechar() }

  const linhaItem = () => `<div class="form-grade item-cp" style="margin-bottom:8px;padding:10px;background:var(--surface2);border-radius:8px;">
    <div class="campo" style="grid-column:span 2;"><label>Produto/serviço *</label><input class="ci-produto"></div>
    <div class="campo"><label>Qtde</label><input class="ci-qtd"></div>
    <div class="campo"><label>Unidade</label><input class="ci-unid" placeholder="un, kg, saco..."></div>
    <button class="btn-secundario mini" type="button" data-remover-item-cp style="align-self:end;">remover</button>
  </div>`
  const addItem = () => {
    const div = document.createElement('div')
    div.innerHTML = linhaItem()
    fundo.querySelector('#cp-itens').appendChild(div.firstElementChild)
    fundo.querySelectorAll('[data-remover-item-cp]').forEach(b => {
      b.onclick = () => { if (fundo.querySelectorAll('.item-cp').length > 1) b.closest('.item-cp').remove() }
    })
  }
  fundo.querySelector('#cp-add-item').onclick = addItem
  addItem()

  fundo.querySelector('#cp-salvar').onclick = async () => {
    const el = fundo.querySelector('#cp-recado')
    const aviso = t => { el.textContent = t; el.classList.remove('oculto'); el.style.borderColor = 'var(--warn-text)'; el.style.color = 'var(--warn-text)' }
    const itens = [...fundo.querySelectorAll('.item-cp')].map((div, i) => ({
      produto_servico: div.querySelector('.ci-produto').value.trim(),
      quantidade: div.querySelector('.ci-qtd').value.trim() || null,
      unidade: div.querySelector('.ci-unid').value.trim() || null,
      ordem: i
    })).filter(it => it.produto_servico)
    if (!itens.length) { aviso('Adicione ao menos um produto ou serviço.'); return }

    const btn = fundo.querySelector('#cp-salvar'); btn.disabled = true; btn.textContent = 'Enviando...'

    let anexoUrl = null, nomeAnexo = null
    const arquivoAnexo = fundo.querySelector('#cp-anexo').files[0]
    if (arquivoAnexo) {
      try {
        const enviado = await enviarArquivo(arquivoAnexo, 'fazenda-compras-anexos')
        anexoUrl = enviado.caminho; nomeAnexo = enviado.nome
      } catch (e) { aviso('Não deu pra enviar o anexo: ' + e.message); btn.disabled = false; btn.textContent = 'Enviar solicitação'; return }
    }

    const resumo = itens.length === 1 ? itens[0].produto_servico : `${itens.length} itens: ${itens.map(i => i.produto_servico).join(', ')}`
    const { data: nova, error } = await db.from('solicitacao_compra').insert({
      produto_servico: resumo.slice(0, 500),
      quantidade: itens.length === 1 ? itens[0].quantidade : null,
      unidade: itens.length === 1 ? itens[0].unidade : null,
      anexo_url: anexoUrl, nome_anexo: nomeAnexo,
      urgencia: fundo.querySelector('#cp-urg').value,
      valor_estimado: numeroBR(fundo.querySelector('#cp-valor').value), local_entrega: fundo.querySelector('#cp-local').value.trim() || 'Fazenda Ouro Branco',
      empresa_id: FAZENDA_EMPRESA_ID, solicitante_id: PERFIL.pessoaId,
      status: 'AGUARDANDO_COTACAO' // Fazenda não passa pela coordenação (isso é só de Indústria/P-TEC) — vai direto pro orçamento
    }).select('id').single()

    if (!error && nova?.id) {
      await db.from('solicitacao_compra_item').insert(itens.map(it => ({ ...it, solicitacao_id: nova.id })))
    }

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
  $('#subtitulo-pagina').textContent = 'Financeiro e vendas do período — filtre por mês, nome e situação, e imprima em PDF'
  const area = $('#area')
  const hoje = hojeISO()
  const de = new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10)
  area.innerHTML = `
    <div class="panel" style="padding:18px;margin-bottom:18px;">
      <div class="filtros">
        <div class="campo"><label>De</label><input type="date" id="rl-de" value="${de}"></div>
        <div class="campo"><label>Até</label><input type="date" id="rl-ate" value="${hoje}"></div>
        <div class="campo"><label>Situação</label><select id="rl-sit">
          <option value="">Todas</option><option value="EFETIVADO">Paga</option><option value="PENDENTE">Pendente</option>
        </select></div>
        <div class="campo" style="min-width:200px;"><label>Nome (fornecedor/descrição)</label><input id="rl-busca" placeholder="ex: veterinário, ração..."></div>
        <button class="btn" id="rl-gerar">Gerar relatório</button>
      </div>
    </div>
    <div id="rl-conteudo"></div>`

  const gerar = async () => {
    const dIni = $('#rl-de').value, dFim = $('#rl-ate').value
    const situacao = $('#rl-sit').value
    const busca = $('#rl-busca').value.trim().toLowerCase()
    $('#rl-conteudo').innerHTML = `<p class="texto-dim2">carregando...</p>`

    let query = db.from('lancamento_financeiro').select('*, categoria:categoria_id(nome), fornecedor:fornecedor_id(nome)')
      .eq('centro_custo_id', FAZENDA_CENTRO_CUSTO_ID).gte('data_lancamento', dIni).lte('data_lancamento', dFim)
    if (situacao) query = query.eq('situacao', situacao)
    const [{ data: lancs }, { data: receitas }] = await Promise.all([
      query.order('data_lancamento'),
      db.from('fazenda_receita').select('*, lote:lote_id(nome)').gte('data', dIni).lte('data', dFim).order('data')
    ])

    let lista = lancs || []
    if (busca) {
      lista = lista.filter(l => (l.descricao || '').toLowerCase().includes(busca) || (l.fornecedor?.nome || '').toLowerCase().includes(busca) || (l.categoria?.nome || '').toLowerCase().includes(busca))
    }
    const despesas = lista.filter(l => l.tipo === 'SAIDA')
    const entradasFin = lista.filter(l => l.tipo === 'ENTRADA')
    const totalDespesas = despesas.reduce((s, l) => s + Number(l.valor || 0), 0)
    const totalDespesasPagas = despesas.filter(l => l.situacao === 'EFETIVADO').reduce((s, l) => s + Number(l.valor || 0), 0)
    const totalEntradasFin = entradasFin.reduce((s, l) => s + Number(l.valor || 0), 0)
    const totalVendas = (receitas || []).reduce((s, r) => s + Number(r.valor_liquido || 0), 0)

    // despesas por mês, pra ver tendência quando o período passa de 1 mês
    const porMes = {}
    despesas.forEach(l => {
      const chave = String(l.data_lancamento).slice(0, 7)
      porMes[chave] = (porMes[chave] || 0) + Number(l.valor || 0)
    })
    const dadosMes = Object.entries(porMes).sort(([a], [b]) => a.localeCompare(b))
      .map(([chave, valor]) => {
        const [a, m] = chave.split('-')
        return { rotulo: new Date(Number(a), Number(m) - 1, 1).toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' }), valor }
      })
    const porCategoria = {}
    despesas.forEach(l => { const n = l.categoria?.nome || 'Sem categoria'; porCategoria[n] = (porCategoria[n] || 0) + Number(l.valor || 0) })
    const dadosCategoria = Object.entries(porCategoria).map(([rotulo, valor]) => ({ rotulo, valor })).sort((a, b) => b.valor - a.valor).slice(0, 8)

    $('#rl-conteudo').innerHTML = `
      <div class="acoes" style="margin-bottom:14px;"><button class="btn-secundario" id="rl-imprimir">Baixar / imprimir PDF</button></div>
      <div id="rl-imprimivel">
        <div class="resumo-topo">
          ${kpi('Despesas no período', 'R$ ' + fmtNum(totalDespesas))}
          ${kpi('Entradas financeiras', 'R$ ' + fmtNum(totalEntradasFin))}
          ${kpi('Vendas de gado', 'R$ ' + fmtNum(totalVendas))}
          ${kpi('Resultado', 'R$ ' + fmtNum(totalEntradasFin + totalVendas - totalDespesas))}
        </div>

        <div class="grade-graficos">
          ${graficoBarras('Despesas por mês', dadosMes, 'var(--gold)')}
          ${graficoBarras('Despesas por categoria', dadosCategoria)}
        </div>
        ${graficoPagoPendente('Despesas — pago x pendente no período', totalDespesasPagas, totalDespesas - totalDespesasPagas)}

        <div class="cabeca-secao" style="margin-top:18px;"><h3 style="font-size:15px;">Despesas (${fmtData(dIni)} a ${fmtData(dFim)})</h3></div>
        <div class="panel" style="padding:0;margin-bottom:18px;"><div class="tabela-scroll">
          <table><thead><tr><th>Data</th><th>Fornecedor</th><th>Descrição</th><th>Categoria</th><th class="num">Valor</th><th>Situação</th></tr></thead><tbody>
            ${despesas.map(l => `<tr><td class="texto-dim2">${fmtData(l.data_lancamento)}</td><td class="texto-dim">${esc(l.fornecedor?.nome ?? '—')}</td>
              <td>${esc(l.descricao ?? '—')}</td><td class="texto-dim2">${esc(l.categoria?.nome ?? '—')}</td><td class="num">R$ ${fmtNum(l.valor)}</td>
              <td>${l.situacao === 'EFETIVADO' ? '<span class="badge-bom">paga</span>' : '<span class="badge-alerta">pendente</span>'}</td></tr>`).join('')
              || `<tr><td colspan="6" class="vazio">Nenhuma despesa no período/filtro.</td></tr>`}
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
      const logoUrl = window.location.href.replace(/[^/]*$/, '') + 'logo-icone.png'
      janela.document.write(`<html><head><title>Relatório Fazenda Ouro Branco</title>
        <style>body{font-family:Arial,sans-serif;padding:24px;color:#222;}
        .cabecalho-impressao{display:flex;align-items:center;gap:14px;border-bottom:2px solid #a8623a;padding-bottom:14px;margin-bottom:14px;}
        .cabecalho-impressao img{width:56px;height:56px;object-fit:contain;}
        .cabecalho-impressao h2{margin:0;font-size:20px;} .cabecalho-impressao p{margin:2px 0 0;color:#666;font-size:12px;}
        table{width:100%;border-collapse:collapse;margin:14px 0 24px;} th,td{border:1px solid #ccc;padding:6px 8px;text-align:left;font-size:13px;}
        th{background:#f0f0f0;} .num{text-align:right;} .grade-graficos,.cartao-grafico,.barra-dupla,.legenda-dupla{display:none;}</style></head><body>
        <div class="cabecalho-impressao">
          <img src="${logoUrl}" alt="Fazenda Ouro Branco" onerror="this.style.display='none'">
          <div><h2>Fazenda Ouro Branco</h2><p>Relatório — período de ${fmtData(dIni)} a ${fmtData(dFim)}</p></div>
        </div>
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
      <button data-sub="ativos">Ativos/Equipamentos</button>
      <button data-sub="produtos">Produtos</button>
      <button data-sub="regras">Regras fiscais</button>
      <button data-sub="inutilizar">Inutilizar numeração</button>
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
  if (sub === 'ativos') subAtivosImobilizados(alvo)
  if (sub === 'produtos') subProdutosFiscal(alvo)
  if (sub === 'regras') subRegrasFiscais(alvo)
  if (sub === 'inutilizar') subInutilizarNumeracao(alvo)
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
        A emissão aqui é direto com a Sefaz (sem provedor terceiro) — usa o certificado digital da fazenda,
        guardado com segurança nos secrets do Supabase. Depois de ativar aqui, teste as etapas abaixo antes de emitir de verdade.</p>
    </div>

    <div class="panel" style="padding:20px;max-width:760px;margin-top:16px;">
      <h3 style="font-size:15px;margin:0 0 6px;">Emissão própria — certificado digital</h3>
      <p class="texto-dim2" style="font-size:12.5px;margin:0 0 14px;">Etapa 1: confirma que o certificado guardado nos secrets do Supabase abre certinho, antes de tentar montar e assinar uma nota de verdade.</p>
      <button class="btn-secundario" id="cfg-testar-cert">Testar certificado</button>
      <div id="cfg-resultado-cert" style="margin-top:14px;"></div>
    </div>

    <div class="panel" style="padding:20px;max-width:760px;margin-top:16px;">
      <h3 style="font-size:15px;margin:0 0 6px;">Etapa 2 — conexão direta com a Sefaz (mTLS)</h3>
      <p class="texto-dim2" style="font-size:12.5px;margin:0 0 14px;">Testa se dá pra abrir conexão apresentando o certificado direto pro webservice da Sefaz (SVRS/TO), sem provedor no meio. Só roda depois do teste de certificado acima dar certo.</p>
      <button class="btn-secundario" id="cfg-testar-mtls">Testar conexão com a Sefaz</button>
      <div id="cfg-resultado-mtls" style="margin-top:14px;"></div>
    </div>

    <div class="panel" style="padding:20px;max-width:760px;margin-top:16px;">
      <h3 style="font-size:15px;margin:0 0 6px;">Etapa 2.5 — status do serviço (chamada de verdade)</h3>
      <p class="texto-dim2" style="font-size:12.5px;margin:0 0 14px;">Chama de verdade o webservice de status da Sefaz — sem precisar assinar XML. Confirma que TLS + SOAP + resposta funcionam ponta a ponta antes de partir pra parte pesada (montar e assinar a nota).</p>
      <button class="btn-secundario" id="cfg-testar-status">Consultar status da Sefaz</button>
      <div id="cfg-resultado-status" style="margin-top:14px;"></div>
    </div>`

  $('#cfg-testar-status').onclick = async () => {
    const resultado = $('#cfg-resultado-status')
    const btn = $('#cfg-testar-status')
    btn.disabled = true; btn.textContent = 'Consultando...'
    resultado.innerHTML = ''
    const { data, error } = await db.functions.invoke('fazenda-status-sefaz', { body: {} })
    btn.disabled = false; btn.textContent = 'Consultar status da Sefaz'
    if (error) {
      let detalhe = null
      if (error?.context?.json) { try { detalhe = await error.context.json() } catch {} }
      resultado.innerHTML = `<div class="recado" style="border-color:var(--warn-text);color:var(--warn-text);">
        <b>${esc(detalhe?.erro ?? error.message)}</b>
        ${detalhe?.detalheTecnico ? `<div class="texto-dim2" style="margin-top:8px;font-size:11px;">${esc(detalhe.detalheTecnico)}</div>` : ''}
        ${detalhe?.etapa ? `<div class="texto-dim2" style="margin-top:4px;font-size:11px;">etapa: ${esc(detalhe.etapa)}</div>` : ''}
      </div>`
      return
    }
    if (!data?.ok && !data?.cStat) {
      resultado.innerHTML = `<div class="recado" style="border-color:var(--warn-text);color:var(--warn-text);">
        <b>${esc(data?.erro ?? 'Falhou.')}</b>
        ${data?.detalheTecnico ? `<div class="texto-dim2" style="margin-top:8px;font-size:11px;">${esc(data.detalheTecnico)}</div>` : ''}
      </div>`
      return
    }
    resultado.innerHTML = `<div class="recado" style="border-color:${data.servicoOperando ? 'var(--good-text)' : 'var(--warn-text)'};color:${data.servicoOperando ? 'var(--good-text)' : 'var(--warn-text)'};">
        <b>cStat ${esc(data.cStat ?? '—')}: ${esc(data.xMotivo ?? 'sem motivo na resposta')}</b>
        <div style="margin-top:4px;">${data.servicoOperando ? 'Serviço em operação — comunicação completa funcionando!' : 'Resposta recebida, mas não é "em operação" — confira o motivo acima.'}</div>
      </div>
      <details style="margin-top:10px;"><summary class="texto-dim2" style="font-size:11.5px;cursor:pointer;">ver resposta bruta da Sefaz</summary>
        <pre style="white-space:pre-wrap;font-size:10.5px;color:var(--dim);margin-top:8px;">${esc(data.respostaBruta ?? '')}</pre>
      </details>`
  }

  $('#cfg-testar-mtls').onclick = async () => {
    const resultado = $('#cfg-resultado-mtls')
    const btn = $('#cfg-testar-mtls')
    btn.disabled = true; btn.textContent = 'Testando (pode levar alguns segundos)...'
    resultado.innerHTML = ''
    const { data, error } = await db.functions.invoke('fazenda-testar-mtls', { body: {} })
    btn.disabled = false; btn.textContent = 'Testar conexão com a Sefaz'
    if (error) {
      let detalhe = null
      if (error?.context?.json) { try { detalhe = await error.context.json() } catch {} }
      resultado.innerHTML = `<div class="recado" style="border-color:var(--warn-text);color:var(--warn-text);">
        <b>${esc(detalhe?.erro ?? error.message)}</b>
        ${detalhe?.implicacao ? `<div style="margin-top:6px;">${esc(detalhe.implicacao)}</div>` : ''}
        ${detalhe?.detalheTecnico ? `<div class="texto-dim2" style="margin-top:8px;font-size:11px;">${esc(detalhe.detalheTecnico)}</div>` : ''}
      </div>`
      return
    }
    if (!data?.ok) {
      resultado.innerHTML = `<div class="recado" style="border-color:var(--warn-text);color:var(--warn-text);">
        <b>${esc(data?.erro ?? 'Falhou.')}</b>
        ${data?.implicacao ? `<div style="margin-top:6px;">${esc(data.implicacao)}</div>` : ''}
        ${data?.detalheTecnico ? `<div class="texto-dim2" style="margin-top:8px;font-size:11px;">${esc(data.detalheTecnico)}</div>` : ''}
      </div>`
      return
    }
    resultado.innerHTML = `<div class="recado" style="border-color:var(--good-text);color:var(--good-text);"><b>${esc(data.mensagem)}</b></div>`
  }

  $('#cfg-testar-cert').onclick = async () => {
    const resultado = $('#cfg-resultado-cert')
    const btn = $('#cfg-testar-cert')
    btn.disabled = true; btn.textContent = 'Testando...'
    resultado.innerHTML = ''
    const { data, error } = await db.functions.invoke('fazenda-testar-certificado', { body: {} })
    btn.disabled = false; btn.textContent = 'Testar certificado'
    if (error) {
      let detalhe = null
      if (error?.context?.json) { try { detalhe = await error.context.json() } catch {} }
      resultado.innerHTML = `<div class="recado" style="border-color:var(--warn-text);color:var(--warn-text);">
        <b>${esc(detalhe?.erro ?? error.message)}</b>
        ${detalhe?.comoResolver ? `<div style="margin-top:6px;">${esc(detalhe.comoResolver)}</div>` : ''}
      </div>`
      return
    }
    if (!data?.ok) {
      resultado.innerHTML = `<div class="recado" style="border-color:var(--warn-text);color:var(--warn-text);">
        <b>${esc(data?.erro ?? 'Falhou.')}</b>
        ${data?.comoResolver ? `<div style="margin-top:6px;">${esc(data.comoResolver)}</div>` : ''}
      </div>`
      return
    }
    const c = data.certificado
    resultado.innerHTML = `<div class="recado" style="border-color:var(--good-text);color:var(--good-text);">
        <b>${esc(data.mensagem)}</b></div>
      <div class="form-grade" style="margin-top:12px;">
        <div class="campo"><label>Sujeito (dono do certificado)</label><div class="texto-dim" style="padding:9px 0;font-size:12.5px;">${esc(c.sujeito)}</div></div>
        <div class="campo"><label>Emitido por</label><div class="texto-dim" style="padding:9px 0;font-size:12.5px;">${esc(c.emissor)}</div></div>
        <div class="campo"><label>Válido até</label><div class="texto-dim" style="padding:9px 0;font-size:12.5px;">${fmtData(c.validoAte.slice(0, 10))} ${c.venceEmBreve ? '<span class="badge-alerta">vence em breve</span>' : '<span class="badge-bom">' + c.diasParaVencer + ' dias</span>'}</div></div>
        <div class="campo"><label>Chave privada</label><div class="texto-dim" style="padding:9px 0;font-size:12.5px;">${c.temChavePrivada ? '<span class="badge-bom">presente</span>' : '<span class="badge-alerta">não encontrada</span>'}</div></div>
      </div>`
  }

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
            : n.xml_url ? `<button class="btn-secundario mini" data-baixar-xml="${esc(n.xml_url)}">baixar XML</button>` : '—'}</td>
        </tr>`).join('') || `<tr><td colspan="6" class="vazio">Nenhuma NFP-e criada ainda.</td></tr>`}
      </tbody></table>
    </div></div>`

  $('#nfe-novo').onclick = () => formNfe(() => subNotasEmitidas(alvo))
  alvo.querySelectorAll('[data-baixar-xml]').forEach(b => {
    b.onclick = async () => {
      const { data, error } = await db.storage.from('documentos').createSignedUrl(b.dataset.baixarXml, 60)
      if (error || !data?.signedUrl) { alert('Não consegui gerar o link do XML: ' + (error?.message ?? '')); return }
      window.open(data.signedUrl, '_blank')
    }
  })
  alvo.querySelectorAll('[data-emitir]').forEach(b => {
    b.onclick = async () => {
      b.disabled = true; b.textContent = 'emitindo...'
      const { data, error } = await db.functions.invoke('fazenda-emitir-nfe-sefaz', { body: { nfeId: b.dataset.emitir } })
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

async function formNfe (aoSalvar) {
  const clientes = window.__FAZENDA_CADASTRO_CLIENTES || []
  const { data: produtos } = await db.from('fazenda_produto')
    .select('id,nome,unidade_padrao,regra:regra_fiscal_id(ncm_sugerido,cfop_interno,cst_icms,aliquota_icms)')
    .eq('ativo', true).order('nome')
  const catalogo = produtos || []

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
      <div class="campo"><label>Inscrição Estadual do destinatário</label><input id="ne-ie" placeholder="deixe vazio se não contribuinte"></div>
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
    <div class="campo" style="grid-column:span 3;"><label>Produto (puxa NCM/CFOP/CST sozinho)</label>
      <select class="ni-produto"><option value="">— descrição livre, sem regra fiscal —</option>
        ${catalogo.map(p => `<option value="${p.id}">${esc(p.nome)}</option>`).join('')}</select></div>
    <div class="campo" style="grid-column:span 2;"><label>Descrição *</label><input class="ni-desc"></div>
    <div class="campo"><label>Qtde *</label><input class="ni-qtd" inputmode="decimal"></div>
    <div class="campo"><label>Unidade</label><input class="ni-un" value="UN"></div>
    <div class="campo"><label>Valor unitário (R$) *</label><input class="ni-valor" inputmode="decimal"></div>
    <div class="campo texto-dim2 ni-regra-info" style="font-size:11px;align-self:end;grid-column:span 2;">sem regra fiscal vinculada — vai sair com CFOP/CST padrão genérico</div>
    <button class="btn-secundario mini" type="button" data-remover-item style="align-self:end;">remover</button>
  </div>`
  const addItem = () => {
    const div = document.createElement('div')
    div.innerHTML = linhaItem()
    const linha = div.firstElementChild
    fundo.querySelector('#ne-itens').appendChild(linha)
    linha.querySelector('[data-remover-item]').onclick = () => linha.remove()
    linha.querySelector('.ni-produto').onchange = e => {
      const prod = catalogo.find(p => p.id === e.target.value)
      const info = linha.querySelector('.ni-regra-info')
      if (!prod) { info.textContent = 'sem regra fiscal vinculada — vai sair com CFOP/CST padrão genérico'; return }
      linha.querySelector('.ni-desc').value = prod.nome
      linha.querySelector('.ni-un').value = prod.unidade_padrao || 'UN'
      linha.dataset.ncm = prod.regra?.ncm_sugerido || ''
      linha.dataset.cfop = prod.regra?.cfop_interno || ''
      linha.dataset.cst = prod.regra?.cst_icms || ''
      linha.dataset.aliquota = prod.regra?.aliquota_icms || ''
      info.innerHTML = prod.regra
        ? `<span class="badge-bom">CFOP ${esc(prod.regra.cfop_interno)} · CST ${esc(prod.regra.cst_icms)}</span>`
        : '<span class="badge-alerta">produto sem regra fiscal vinculada — cadastre em Fiscal → Produtos</span>'
    }
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
      valor_total: (numeroBR(div.querySelector('.ni-qtd').value) || 0) * (numeroBR(div.querySelector('.ni-valor').value) || 0),
      ncm: div.dataset.ncm || null, cfop: div.dataset.cfop || null,
      cst_icms: div.dataset.cst || null, aliquota_icms: div.dataset.aliquota ? Number(div.dataset.aliquota) : null
    })).filter(it => it.descricao)
    if (!itens.length) { aviso('Adicione ao menos um item com descrição.'); return }
    const valorTotal = itens.reduce((s, it) => s + it.valor_total, 0)

    const btn = fundo.querySelector('#ne-salvar'); btn.disabled = true; btn.textContent = 'Salvando...'
    const { error } = await db.from('fazenda_nfe').insert({
      tipo: fundo.querySelector('#ne-tipo').value, destinatario_nome: nome,
      destinatario_documento: fundo.querySelector('#ne-doc').value.trim() || null,
      destinatario_ie: fundo.querySelector('#ne-ie').value.trim() || null,
      itens, valor_total: valorTotal, observacoes: fundo.querySelector('#ne-obs').value.trim() || null,
      criado_por: PERFIL.pessoaId
    })
    btn.disabled = false; btn.textContent = 'Criar rascunho'
    if (error) { aviso(error.message); return }
    fechar(); aoSalvar()
  }
}

// ----- Ativos/Equipamentos (bens do imobilizado disponíveis pra venda) -----
async function subAtivosImobilizados (alvo) {
  const [{ data: ativos }, { data: regras }] = await Promise.all([
    db.from('fazenda_ativo_imobilizado').select('*, regra:regra_fiscal_id(nome, cfop_interno, situacao_icms)').order('criado_em', { ascending: false }),
    db.from('fazenda_regra_fiscal').select('id,nome').eq('ativo', true).order('nome')
  ])
  window.__FAZENDA_REGRAS_FISCAIS = regras || []
  const lista = ativos || []
  const CHIP_STATUS = { DISPONIVEL: '<span class="chip">disponível</span>', VENDIDO: '<span class="badge-bom">vendido</span>', BAIXADO: '<span class="badge-alerta">baixado</span>' }

  alvo.innerHTML = `
    <p class="texto-dim2" style="margin-bottom:14px;font-size:12.5px;">Máquinas, equipamentos e veículos do ativo imobilizado da fazenda — disponíveis ou já vendidos, com a regra fiscal já vinculada pra usar na hora de emitir a nota.</p>
    ${PERFIL.editavel ? `<div class="acoes" style="margin-bottom:16px;"><button class="btn" id="at-novo">+ Adicionar ativo</button></div>` : ''}
    <div class="panel" style="padding:0;"><div class="tabela-scroll">
      <table><thead><tr><th>Descrição</th><th>NCM</th><th>Regra fiscal</th><th class="num">Valor aquisição</th><th class="num">Valor venda</th><th>Status</th>${PERFIL.editavel ? '<th></th>' : ''}</tr></thead><tbody>
        ${lista.map(a => `<tr>
          <td><b>${esc(a.descricao)}</b>${a.numero_patrimonio ? `<div class="texto-dim2" style="font-size:11px;">patrim. ${esc(a.numero_patrimonio)}</div>` : ''}</td>
          <td class="texto-dim2">${esc(a.ncm ?? '—')}</td>
          <td class="texto-dim">${a.regra ? `${esc(a.regra.nome)} <span class="chip">CFOP ${esc(a.regra.cfop_interno)}</span>` : '<span class="texto-dim2">—</span>'}</td>
          <td class="num">${a.valor_aquisicao ? 'R$ ' + fmtNum(a.valor_aquisicao) : '—'}</td>
          <td class="num">${a.valor_venda ? 'R$ ' + fmtNum(a.valor_venda) : '—'}</td>
          <td>${CHIP_STATUS[a.status] || esc(a.status)}</td>
          ${PERFIL.editavel ? `<td><button class="btn-secundario mini" data-editar="${a.id}">editar</button></td>` : ''}
        </tr>`).join('') || `<tr><td colspan="${PERFIL.editavel ? 7 : 6}" class="vazio">Nenhum ativo cadastrado ainda.</td></tr>`}
      </tbody></table>
    </div></div>`

  if (PERFIL.editavel) {
    $('#at-novo').onclick = () => formAtivoImobilizado(null, () => subAtivosImobilizados(alvo))
    alvo.querySelectorAll('[data-editar]').forEach(b => {
      b.onclick = () => formAtivoImobilizado(lista.find(x => x.id === b.dataset.editar), () => subAtivosImobilizados(alvo))
    })
  }
}
function formAtivoImobilizado (registro, aoSalvar) {
  const regras = window.__FAZENDA_REGRAS_FISCAIS || []
  const fundo = document.createElement('div')
  fundo.className = 'modal-fundo'
  fundo.innerHTML = `<div class="modal">
    <h3>${registro ? 'Editar' : 'Novo'} ativo/equipamento</h3>
    <div class="form-grade">
      <div class="campo" style="grid-column:1/-1;"><label>Descrição *</label><input id="at-desc" value="${esc(registro?.descricao ?? '')}" placeholder="ex: Trator Massey Ferguson 275, ano 2015"></div>
      <div class="campo"><label>NCM</label><input id="at-ncm" value="${esc(registro?.ncm ?? '')}" placeholder="ex: 87019000"></div>
      <div class="campo"><label>Nº patrimônio</label><input id="at-patrim" value="${esc(registro?.numero_patrimonio ?? '')}"></div>
      <div class="campo"><label>Regra fiscal</label><select id="at-regra"><option value="">—</option>${regras.map(r => `<option value="${r.id}" ${registro?.regra_fiscal_id === r.id ? 'selected' : ''}>${esc(r.nome)}</option>`).join('')}</select></div>
      <div class="campo"><label>Status</label><select id="at-status">
        <option value="DISPONIVEL" ${(!registro || registro.status === 'DISPONIVEL') ? 'selected' : ''}>Disponível</option>
        <option value="VENDIDO" ${registro?.status === 'VENDIDO' ? 'selected' : ''}>Vendido</option>
        <option value="BAIXADO" ${registro?.status === 'BAIXADO' ? 'selected' : ''}>Baixado</option>
      </select></div>
      <div class="campo"><label>Data de aquisição</label><input type="date" id="at-data-aq" value="${registro?.data_aquisicao ?? ''}"></div>
      <div class="campo"><label>Valor de aquisição (R$)</label><input id="at-valor-aq" inputmode="decimal" value="${registro?.valor_aquisicao ?? ''}"></div>
      <div class="campo"><label>Data da venda</label><input type="date" id="at-data-vd" value="${registro?.data_venda ?? ''}"></div>
      <div class="campo"><label>Valor de venda (R$)</label><input id="at-valor-vd" inputmode="decimal" value="${registro?.valor_venda ?? ''}"></div>
    </div>
    <div class="campo" style="margin-top:10px;"><label>Observações</label><textarea id="at-obs" style="min-height:60px;">${esc(registro?.observacoes ?? '')}</textarea></div>
    <div class="acoes" style="margin-top:14px;"><button class="btn" id="at-salvar">Salvar</button>
      <button class="btn-secundario" id="at-fechar">Fechar</button></div>
    <div class="recado oculto" id="at-recado"></div>
  </div>`
  document.body.appendChild(fundo)
  const fechar = () => fundo.remove()
  fundo.querySelector('#at-fechar').onclick = fechar
  fundo.onclick = e => { if (e.target === fundo) fechar() }

  fundo.querySelector('#at-salvar').onclick = async () => {
    const el = fundo.querySelector('#at-recado')
    const aviso = t => { el.textContent = t; el.classList.remove('oculto'); el.style.borderColor = 'var(--warn-text)'; el.style.color = 'var(--warn-text)' }
    const descricao = fundo.querySelector('#at-desc').value.trim()
    if (!descricao) { aviso('Escreva a descrição do ativo.'); return }
    const btn = fundo.querySelector('#at-salvar'); btn.disabled = true; btn.textContent = 'Salvando...'
    const corpo = {
      descricao, ncm: fundo.querySelector('#at-ncm').value.trim() || null,
      numero_patrimonio: fundo.querySelector('#at-patrim').value.trim() || null,
      regra_fiscal_id: fundo.querySelector('#at-regra').value || null,
      status: fundo.querySelector('#at-status').value,
      data_aquisicao: fundo.querySelector('#at-data-aq').value || null,
      valor_aquisicao: numeroBR(fundo.querySelector('#at-valor-aq').value),
      data_venda: fundo.querySelector('#at-data-vd').value || null,
      valor_venda: numeroBR(fundo.querySelector('#at-valor-vd').value),
      observacoes: fundo.querySelector('#at-obs').value.trim() || null
    }
    let error
    if (registro) { ({ error } = await db.from('fazenda_ativo_imobilizado').update(corpo).eq('id', registro.id)) }
    else { ({ error } = await db.from('fazenda_ativo_imobilizado').insert({ ...corpo, criado_por: PERFIL.pessoaId })) }
    btn.disabled = false; btn.textContent = 'Salvar'
    if (error) { aviso(error.message); return }
    fechar(); aoSalvar()
  }
}

// ----- Regras fiscais (CFOP/CST/ICMS reutilizáveis por tipo de operação) -----
async function subRegrasFiscais (alvo) {
  const { data } = await db.from('fazenda_regra_fiscal').select('*').order('nome')
  const lista = data || []
  const ROTULO_SIT = { TRIBUTADO: 'Tributado', ISENTO: 'Isento', NAO_INCIDENCIA: 'Não incidência' }
  const COR_SIT = s => s === 'TRIBUTADO' ? 'chip' : 'badge-bom'

  alvo.innerHTML = `
    <p class="texto-dim2" style="margin-bottom:14px;font-size:12.5px;">Enquadramentos fiscais prontos (CFOP/CST/ICMS) por tipo de operação — usados pra pré-preencher itens de ativos e notas, evitando erro de digitação na hora de emitir.</p>
    ${PERFIL.editavel ? `<div class="acoes" style="margin-bottom:16px;"><button class="btn" id="rf-novo">+ Nova regra fiscal</button></div>` : ''}
    <div class="panel" style="padding:0;"><div class="tabela-scroll">
      <table><thead><tr><th>Nome</th><th>CFOP interno</th><th>CFOP interestadual</th><th>CST</th><th>Situação ICMS</th><th class="num">Alíquota</th>${PERFIL.editavel ? '<th></th>' : ''}</tr></thead><tbody>
        ${lista.map(r => `<tr>
          <td><b>${esc(r.nome)}</b>${!r.ativo ? ' <span class="chip">inativa</span>' : ''}${r.base_legal ? `<div class="texto-dim2" style="font-size:11px;">${esc(r.base_legal)}</div>` : ''}</td>
          <td class="texto-dim">${esc(r.cfop_interno)}</td><td class="texto-dim">${esc(r.cfop_interestadual)}</td>
          <td class="texto-dim2">${esc(r.cst_icms)}</td>
          <td><span class="${COR_SIT(r.situacao_icms)}">${esc(ROTULO_SIT[r.situacao_icms] ?? r.situacao_icms)}</span></td>
          <td class="num">${r.aliquota_icms ? fmtNum(r.aliquota_icms, 1) + '%' : '—'}</td>
          ${PERFIL.editavel ? `<td><button class="btn-secundario mini" data-editar="${r.id}">editar</button> <button class="btn-secundario mini" data-excluir="${r.id}">excluir</button></td>` : ''}
        </tr>`).join('') || `<tr><td colspan="${PERFIL.editavel ? 7 : 6}" class="vazio">Nenhuma regra fiscal cadastrada ainda.</td></tr>`}
      </tbody></table>
    </div></div>`

  if (PERFIL.editavel) {
    $('#rf-novo').onclick = () => formRegraFiscal(null, () => subRegrasFiscais(alvo))
    alvo.querySelectorAll('[data-editar]').forEach(b => {
      b.onclick = () => formRegraFiscal(lista.find(x => x.id === b.dataset.editar), () => subRegrasFiscais(alvo))
    })
    alvo.querySelectorAll('[data-excluir]').forEach(b => {
      b.onclick = async () => {
        if (!confirm('Excluir essa regra fiscal? Se ela já estiver vinculada a algum produto ou ativo, a exclusão vai ser recusada — nesse caso, marque como "Inativa" em vez de excluir.')) return
        const { error } = await db.from('fazenda_regra_fiscal').delete().eq('id', b.dataset.excluir)
        if (error) { alert('Não consegui excluir: ' + error.message); return }
        subRegrasFiscais(alvo)
      }
    })
  }
}
function formRegraFiscal (registro, aoSalvar) {
  const fundo = document.createElement('div')
  fundo.className = 'modal-fundo'
  fundo.innerHTML = `<div class="modal">
    <h3>${registro ? 'Editar' : 'Nova'} regra fiscal</h3>
    <div class="form-grade">
      <div class="campo" style="grid-column:1/-1;"><label>Nome *</label><input id="rf-nome" value="${esc(registro?.nome ?? '')}" placeholder="ex: Venda de ativo imobilizado (equipamento/máquina)"></div>
      <div class="campo"><label>Tipo de operação</label><select id="rf-tipo">
        <option value="ATIVO_IMOBILIZADO" ${(!registro || registro.tipo_operacao === 'ATIVO_IMOBILIZADO') ? 'selected' : ''}>Venda de ativo imobilizado</option>
        <option value="PRODUCAO_RURAL" ${registro?.tipo_operacao === 'PRODUCAO_RURAL' ? 'selected' : ''}>Venda de produção rural</option>
        <option value="OUTRO" ${registro?.tipo_operacao === 'OUTRO' ? 'selected' : ''}>Outro</option>
      </select></div>
      <div class="campo"><label>NCM sugerido</label><input id="rf-ncm" value="${esc(registro?.ncm_sugerido ?? '')}"></div>
      <div class="campo"><label>CFOP interno (TO) *</label><input id="rf-cfop-int" value="${esc(registro?.cfop_interno ?? '')}" placeholder="ex: 5551"></div>
      <div class="campo"><label>CFOP interestadual *</label><input id="rf-cfop-ext" value="${esc(registro?.cfop_interestadual ?? '')}" placeholder="ex: 6551"></div>
      <div class="campo"><label>CST ICMS *</label><input id="rf-cst" value="${esc(registro?.cst_icms ?? '')}" placeholder="ex: 41"></div>
      <div class="campo"><label>Situação ICMS</label><select id="rf-situacao">
        <option value="NAO_INCIDENCIA" ${(!registro || registro.situacao_icms === 'NAO_INCIDENCIA') ? 'selected' : ''}>Não incidência</option>
        <option value="ISENTO" ${registro?.situacao_icms === 'ISENTO' ? 'selected' : ''}>Isento</option>
        <option value="TRIBUTADO" ${registro?.situacao_icms === 'TRIBUTADO' ? 'selected' : ''}>Tributado</option>
      </select></div>
      <div class="campo"><label>Alíquota ICMS (%)</label><input id="rf-aliquota" inputmode="decimal" value="${registro?.aliquota_icms ?? 0}"></div>
      <div class="campo"><label>Redução base de cálculo (%)</label><input id="rf-reducao" inputmode="decimal" value="${registro?.reducao_base_calculo_pct ?? 0}"></div>
      <div class="campo"><label>Status</label><select id="rf-ativo">
        <option value="true" ${(!registro || registro.ativo) ? 'selected' : ''}>Ativa</option>
        <option value="false" ${(registro && !registro.ativo) ? 'selected' : ''}>Inativa</option>
      </select></div>
    </div>
    <div class="campo" style="margin-top:10px;"><label>Base legal</label><input id="rf-base-legal" value="${esc(registro?.base_legal ?? '')}" placeholder="ex: LC 87/96, art. 3º; RICMS-TO"></div>
    <div class="campo" style="margin-top:10px;"><label>Observação</label><textarea id="rf-obs" style="min-height:70px;">${esc(registro?.observacao ?? '')}</textarea></div>
    <div class="acoes" style="margin-top:14px;"><button class="btn" id="rf-salvar">Salvar</button>
      <button class="btn-secundario" id="rf-fechar">Fechar</button></div>
    <div class="recado oculto" id="rf-recado"></div>
  </div>`
  document.body.appendChild(fundo)
  const fechar = () => fundo.remove()
  fundo.querySelector('#rf-fechar').onclick = fechar
  fundo.onclick = e => { if (e.target === fundo) fechar() }

  fundo.querySelector('#rf-salvar').onclick = async () => {
    const el = fundo.querySelector('#rf-recado')
    const aviso = t => { el.textContent = t; el.classList.remove('oculto'); el.style.borderColor = 'var(--warn-text)'; el.style.color = 'var(--warn-text)' }
    const nome = fundo.querySelector('#rf-nome').value.trim()
    const cfopInt = fundo.querySelector('#rf-cfop-int').value.trim()
    const cfopExt = fundo.querySelector('#rf-cfop-ext').value.trim()
    const cst = fundo.querySelector('#rf-cst').value.trim()
    if (!nome) { aviso('Escreva o nome da regra.'); return }
    if (!cfopInt || !cfopExt) { aviso('Informe os dois CFOPs (interno e interestadual).'); return }
    if (!cst) { aviso('Informe o CST do ICMS.'); return }
    const btn = fundo.querySelector('#rf-salvar'); btn.disabled = true; btn.textContent = 'Salvando...'
    const corpo = {
      nome, tipo_operacao: fundo.querySelector('#rf-tipo').value, ncm_sugerido: fundo.querySelector('#rf-ncm').value.trim() || null,
      cfop_interno: cfopInt, cfop_interestadual: cfopExt, cst_icms: cst,
      situacao_icms: fundo.querySelector('#rf-situacao').value,
      aliquota_icms: numeroBR(fundo.querySelector('#rf-aliquota').value) ?? 0,
      reducao_base_calculo_pct: numeroBR(fundo.querySelector('#rf-reducao').value) ?? 0,
      base_legal: fundo.querySelector('#rf-base-legal').value.trim() || null,
      observacao: fundo.querySelector('#rf-obs').value.trim() || null,
      ativo: fundo.querySelector('#rf-ativo').value === 'true'
    }
    let error
    if (registro) { ({ error } = await db.from('fazenda_regra_fiscal').update(corpo).eq('id', registro.id)) }
    else { ({ error } = await db.from('fazenda_regra_fiscal').insert({ ...corpo, criado_por: PERFIL.pessoaId })) }
    btn.disabled = false; btn.textContent = 'Salvar'
    if (error) { aviso(error.message); return }
    fechar(); aoSalvar()
  }
}

// ----- Produtos (catálogo vinculado à regra fiscal — resolve o CFOP/CST puxar automático na nota) -----
async function subProdutosFiscal (alvo) {
  const [{ data: produtos }, { data: regras }] = await Promise.all([
    db.from('fazenda_produto').select('*, regra:regra_fiscal_id(nome)').order('nome'),
    db.from('fazenda_regra_fiscal').select('id,nome').eq('ativo', true).order('nome')
  ])
  const lista = produtos || []

  alvo.innerHTML = `
    <p class="texto-dim2" style="margin-bottom:14px;font-size:12.5px;">Produtos que a fazenda vende (categorias de gado etc.) já com a regra fiscal (CFOP/CST) vinculada — na hora de montar uma nota, escolhe o produto e o resto vem sozinho.</p>
    ${PERFIL.editavel ? `<div class="acoes" style="margin-bottom:16px;"><button class="btn" id="pf-novo">+ Novo produto</button></div>` : ''}
    <div class="panel" style="padding:0;"><div class="tabela-scroll">
      <table><thead><tr><th>Nome</th><th>Unidade</th><th>Regra fiscal</th><th>Status</th>${PERFIL.editavel ? '<th></th>' : ''}</tr></thead><tbody>
        ${lista.map(p => `<tr>
          <td><b>${esc(p.nome)}</b>${p.observacao ? `<div class="texto-dim2" style="font-size:11px;">${esc(p.observacao)}</div>` : ''}</td>
          <td class="texto-dim">${esc(p.unidade_padrao)}</td>
          <td class="texto-dim2">${p.regra ? esc(p.regra.nome) : '<span class="badge-alerta">sem regra vinculada</span>'}</td>
          <td>${p.ativo ? '<span class="badge-bom">ativo</span>' : '<span class="chip">inativo</span>'}</td>
          ${PERFIL.editavel ? `<td><button class="btn-secundario mini" data-editar="${p.id}">editar</button> <button class="btn-secundario mini" data-excluir="${p.id}">excluir</button></td>` : ''}
        </tr>`).join('') || `<tr><td colspan="${PERFIL.editavel ? 5 : 4}" class="vazio">Nenhum produto cadastrado ainda.</td></tr>`}
      </tbody></table>
    </div></div>`

  if (PERFIL.editavel) {
    $('#pf-novo').onclick = () => formProduto(null, regras || [], () => subProdutosFiscal(alvo))
    alvo.querySelectorAll('[data-editar]').forEach(b => {
      b.onclick = () => formProduto(lista.find(x => x.id === b.dataset.editar), regras || [], () => subProdutosFiscal(alvo))
    })
    alvo.querySelectorAll('[data-excluir]').forEach(b => {
      b.onclick = async () => {
        if (!confirm('Excluir esse produto?')) return
        const { error } = await db.from('fazenda_produto').delete().eq('id', b.dataset.excluir)
        if (error) { alert('Não consegui excluir: ' + error.message); return }
        subProdutosFiscal(alvo)
      }
    })
  }
}

function formProduto (registro, regras, aoSalvar) {
  const fundo = document.createElement('div')
  fundo.className = 'modal-fundo'
  fundo.innerHTML = `<div class="modal">
    <h3>${registro ? 'Editar' : 'Novo'} produto</h3>
    <div class="form-grade">
      <div class="campo" style="grid-column:1/-1;"><label>Nome *</label><input id="pf-nome" value="${esc(registro?.nome ?? '')}" placeholder="ex: Boi gordo, Novilha, Bezerro..."></div>
      <div class="campo"><label>Unidade padrão</label><input id="pf-unidade" value="${esc(registro?.unidade_padrao ?? 'UN')}"></div>
      <div class="campo"><label>Regra fiscal</label><select id="pf-regra"><option value="">— sem regra vinculada —</option>
        ${regras.map(r => `<option value="${r.id}" ${registro?.regra_fiscal_id === r.id ? 'selected' : ''}>${esc(r.nome)}</option>`).join('')}</select></div>
      <div class="campo"><label>Status</label><select id="pf-ativo">
        <option value="true" ${(!registro || registro.ativo) ? 'selected' : ''}>Ativo</option>
        <option value="false" ${(registro && !registro.ativo) ? 'selected' : ''}>Inativo</option>
      </select></div>
    </div>
    <div class="campo" style="margin-top:10px;"><label>Observação</label><textarea id="pf-obs" style="min-height:60px;">${esc(registro?.observacao ?? '')}</textarea></div>
    <div class="acoes" style="margin-top:14px;"><button class="btn" id="pf-salvar">Salvar</button>
      <button class="btn-secundario" id="pf-fechar">Fechar</button></div>
    <div class="recado oculto" id="pf-recado"></div>
  </div>`
  document.body.appendChild(fundo)
  const fechar = () => fundo.remove()
  fundo.querySelector('#pf-fechar').onclick = fechar
  fundo.onclick = e => { if (e.target === fundo) fechar() }

  fundo.querySelector('#pf-salvar').onclick = async () => {
    const el = fundo.querySelector('#pf-recado')
    const aviso = t => { el.textContent = t; el.classList.remove('oculto'); el.style.borderColor = 'var(--warn-text)'; el.style.color = 'var(--warn-text)' }
    const nome = fundo.querySelector('#pf-nome').value.trim()
    if (!nome) { aviso('Escreva o nome do produto.'); return }
    const btn = fundo.querySelector('#pf-salvar'); btn.disabled = true; btn.textContent = 'Salvando...'
    const corpo = {
      nome, unidade_padrao: fundo.querySelector('#pf-unidade').value.trim() || 'UN',
      regra_fiscal_id: fundo.querySelector('#pf-regra').value || null,
      ativo: fundo.querySelector('#pf-ativo').value === 'true',
      observacao: fundo.querySelector('#pf-obs').value.trim() || null,
      atualizado_em: new Date().toISOString()
    }
    let error
    if (registro) { ({ error } = await db.from('fazenda_produto').update(corpo).eq('id', registro.id)) }
    else { ({ error } = await db.from('fazenda_produto').insert({ ...corpo, criado_por: PERFIL.pessoaId })) }
    btn.disabled = false; btn.textContent = 'Salvar'
    if (error) { aviso(error.message); return }
    fechar(); aoSalvar()
  }
}

// ----- Inutilizar numeração -----
async function subInutilizarNumeracao (alvo) {
  const { data } = await db.from('fazenda_inutilizacao_nfe').select('*').order('criado_em', { ascending: false })
  const lista = data || []
  const ROTULO = { PENDENTE: 'Pendente', HOMOLOGADA: 'Homologada', REJEITADA: 'Rejeitada' }
  const cor = s => s === 'HOMOLOGADA' ? 'badge-bom' : s === 'REJEITADA' ? 'badge-alerta' : 'chip'

  alvo.innerHTML = `
    <p class="texto-dim2" style="margin-bottom:14px;font-size:12.5px;">Processo formal da Sefaz pra "queimar" oficialmente um número (ou faixa) de NFP-e que nunca chegou a ser usado — diferente de cancelar, que é pra nota já autorizada. Use só se pulou algum número por engano.</p>
    ${PERFIL.editavel ? `<div class="acoes" style="margin-bottom:16px;"><button class="btn" id="in-novo">+ Solicitar inutilização</button></div>` : ''}
    <div class="panel" style="padding:0;"><div class="tabela-scroll">
      <table><thead><tr><th>Série</th><th>Faixa</th><th>Justificativa</th><th>Status</th></tr></thead><tbody>
        ${lista.map(p => `<tr>
          <td class="texto-dim2">${p.serie}</td>
          <td class="texto-dim2">${p.numero_inicial}${p.numero_final !== p.numero_inicial ? ' a ' + p.numero_final : ''}</td>
          <td style="max-width:320px;">${esc(p.justificativa)}</td>
          <td><span class="${cor(p.status)}">${esc(ROTULO[p.status] ?? p.status)}</span>
            ${p.motivo ? `<div class="texto-dim2" style="font-size:10.5px;margin-top:2px;">${esc(p.motivo)}</div>` : ''}
            ${p.status === 'PENDENTE' && PERFIL.editavel ? `<div style="margin-top:4px;"><button class="btn-secundario mini" data-enviar="${p.id}">enviar pra Sefaz</button></div>` : ''}
          </td>
        </tr>`).join('') || `<tr><td colspan="4" class="vazio">Nenhum pedido de inutilização ainda.</td></tr>`}
      </tbody></table>
    </div></div>`

  if (PERFIL.editavel) {
    $('#in-novo').onclick = () => formInutilizacao(() => subInutilizarNumeracao(alvo))
    alvo.querySelectorAll('[data-enviar]').forEach(b => {
      b.onclick = async () => {
        b.disabled = true; b.textContent = 'enviando...'
        const { data, error } = await db.functions.invoke('fazenda-inutilizar-nfe', { body: { inutilizacaoId: b.dataset.enviar } })
        if (error || data?.erro) {
          let msg = data?.erro || error?.message
          if (error?.context?.json) { try { const c = await error.context.json(); msg = c?.erro || msg } catch {} }
          alert(msg)
        }
        subInutilizarNumeracao(alvo)
      }
    })
  }
}

function formInutilizacao (aoSalvar) {
  const fundo = document.createElement('div')
  fundo.className = 'modal-fundo'
  fundo.innerHTML = `<div class="modal">
    <h3>Solicitar inutilização de numeração</h3>
    <p class="texto-dim2" style="font-size:12px;margin:-8px 0 14px;">A justificativa precisa ter pelo menos 15 caracteres — a Sefaz exige isso.</p>
    <div class="form-grade">
      <div class="campo"><label>Série *</label><input id="iu-serie" value="1"></div>
      <div class="campo"><label>Número inicial *</label><input id="iu-ini" inputmode="numeric"></div>
      <div class="campo"><label>Número final *</label><input id="iu-fim" inputmode="numeric"></div>
    </div>
    <div class="campo" style="margin-top:10px;"><label>Justificativa *</label><textarea id="iu-just" style="min-height:70px;" placeholder="ex: números pulados por erro de configuração no sistema, nunca chegaram a ser emitidos."></textarea></div>
    <div class="acoes" style="margin-top:14px;"><button class="btn" id="iu-salvar">Criar pedido</button>
      <button class="btn-secundario" id="iu-fechar">Fechar</button></div>
    <div class="recado oculto" id="iu-recado"></div>
  </div>`
  document.body.appendChild(fundo)
  const fechar = () => fundo.remove()
  fundo.querySelector('#iu-fechar').onclick = fechar
  fundo.onclick = e => { if (e.target === fundo) fechar() }

  fundo.querySelector('#iu-salvar').onclick = async () => {
    const el = fundo.querySelector('#iu-recado')
    const aviso = t => { el.textContent = t; el.classList.remove('oculto'); el.style.borderColor = 'var(--warn-text)'; el.style.color = 'var(--warn-text)' }
    const serie = Number(fundo.querySelector('#iu-serie').value) || 0
    const ini = Number(fundo.querySelector('#iu-ini').value) || 0
    const fim = Number(fundo.querySelector('#iu-fim').value) || 0
    const just = fundo.querySelector('#iu-just').value.trim()
    if (!serie || !ini || !fim) { aviso('Preencha série, número inicial e final.'); return }
    if (fim < ini) { aviso('O número final não pode ser menor que o inicial.'); return }
    if (just.length < 15) { aviso('A justificativa precisa ter pelo menos 15 caracteres.'); return }
    const btn = fundo.querySelector('#iu-salvar'); btn.disabled = true; btn.textContent = 'Salvando...'
    const { error } = await db.from('fazenda_inutilizacao_nfe').insert({
      serie, numero_inicial: ini, numero_final: fim, justificativa: just, criado_por: PERFIL.pessoaId
    })
    btn.disabled = false; btn.textContent = 'Criar pedido'
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
