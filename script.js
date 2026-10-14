/* =========================================================
   Calculadora de Peças — script.js

   Como este arquivo está organizado:
   1. Dados (estado) e localStorage
   2. Funções auxiliares (dinheiro, ids, segurança do HTML)
   3. Regras de cálculo (margem, frete, preço final)
   4. Telas (funções que montam o HTML)
   5. Ações (adicionar, editar, excluir, copiar)
   6. Eventos (ligar cliques e digitação às ações)
   ========================================================= */


/* ---------- 1. DADOS E LOCALSTORAGE ---------- */

// Nomes das "gavetas" onde guardamos tudo no navegador.
const CHAVE_CADASTROS = 'calculadora_cadastros';
const CHAVE_ORCAMENTO = 'calculadora_orcamento_atual';

// Dados de exemplo usados só na primeira vez que o site abre.
const CADASTROS_INICIAIS = {
  tiposPeca: [
    { id: 'tipo-freios', nome: 'Freios' },
    { id: 'tipo-suspensao', nome: 'Suspensão' },
    { id: 'tipo-filtros', nome: 'Filtros' },
  ],
  fornecedores: [
    { id: 'forn-a', nome: 'Distribuidora A', frete: 25, gratisAcima: 300 },
    { id: 'forn-b', nome: 'Distribuidora B', frete: 15, gratisAcima: 0 },
  ],
  margens: { 'tipo-freios': 40, 'tipo-suspensao': 35, 'tipo-filtros': 50 }, // { idDoTipo: porcentagem }
  excecoes: [],          // [{ id, fornecedorId, tipoId, margem }]
};

// "Estado" = os dados que o site está usando agora, na memória.
let erroLeituraDados = false;
let cadastros = carregar(CHAVE_CADASTROS, CADASTROS_INICIAIS);
let orcamento = carregar(CHAVE_ORCAMENTO, { pecas: [] });
// Cada peça: { id, nome, tipoId, quantidade, custos: { idFornecedor: custoUnitario }, escolhido: idFornecedor }

// Qual aba principal está aberta.
let abaPrincipal = 'orcamento';

function carregar(chave, valorPadrao) {
  try {
    const texto = localStorage.getItem(chave);
    // JSON.parse transforma o texto salvo de volta em objeto.
    return texto ? JSON.parse(texto) : structuredClone(valorPadrao);
  } catch (erro) {
    console.error('Não consegui ler os dados de', chave, erro);
    erroLeituraDados = true;
    return structuredClone(valorPadrao);
  }
}

function salvarCadastros() {
  return salvar(CHAVE_CADASTROS, cadastros);
}

function salvarOrcamento() {
  return salvar(CHAVE_ORCAMENTO, orcamento);
}

function salvar(chave, dados) {
  try {
    localStorage.setItem(chave, JSON.stringify(dados));
    return true;
  } catch (erro) {
    console.error('Não consegui salvar os dados em', chave, erro);
    aviso('Não foi possível salvar. Seus dados continuam nesta tela, mas podem ser perdidos ao fechar.');
    return false;
  }
}


/* ---------- 2. FUNÇÕES AUXILIARES ---------- */

// Cria um código único, ex.: "lq3k9x2ab1c".
function gerarId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

const formatoReal = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

// 1234.5 -> "R$ 1.234,50"
function dinheiro(valor) {
  return formatoReal.format(valor || 0);
}

// Aceita "12,50" ou "12.50" e devolve o número 12.5 (ou 0 se estiver vazio).
function paraNumero(valor) {
  const numero = Number(String(valor).replace(',', '.'));
  return Number.isFinite(numero) ? numero : 0;
}

function numeroDoCampo(campo) {
  if (campo.value.trim() === '') return null;
  const numero = Number(campo.value.replace(',', '.'));
  return Number.isFinite(numero) ? numero : null;
}

function arredondar(valor) {
  return Math.round(valor * 100) / 100;
}

// Impede que um nome digitado com "<" ou ">" vire código HTML na página.
function escaparHtml(texto) {
  const trocas = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  return String(texto ?? '').replace(/[&<>"']/g, (letra) => trocas[letra]);
}

function acharTipo(id) {
  return cadastros.tiposPeca.find((tipo) => tipo.id === id);
}

function acharFornecedor(id) {
  return cadastros.fornecedores.find((fornecedor) => fornecedor.id === id);
}

function prazoEntrega(fornecedor) {
  const dias = fornecedor.prazoEntregaDias;
  if (!Number.isInteger(dias) || dias < 0) return 'não informado';
  return `${dias} ${dias === 1 ? 'dia' : 'dias'}`;
}

function acharPeca(id) {
  return orcamento.pecas.find((peca) => peca.id === id);
}

function nomeDoTipo(id) {
  return acharTipo(id)?.nome ?? '(tipo excluído)';
}

// Mostra uma mensagem rápida embaixo da tela.
let temporizadorAviso;
function aviso(mensagem) {
  const caixa = document.getElementById('aviso');
  caixa.textContent = mensagem;
  caixa.hidden = false;
  clearTimeout(temporizadorAviso);
  temporizadorAviso = setTimeout(() => (caixa.hidden = true), 2500);
}


/* ---------- 3. REGRAS DE CÁLCULO ---------- */

// Margem de uma peça: primeiro procura exceção (fornecedor + tipo); se não houver, usa a padrão do tipo.
function margemPara(fornecedorId, tipoId) {
  const excecao = cadastros.excecoes.find(
    (e) => e.fornecedorId === fornecedorId && e.tipoId === tipoId
  );
  if (excecao) return excecao.margem;
  return cadastros.margens[tipoId] ?? 0;
}

// Quanto de frete o fornecedor cobra para um certo valor de compra.
function freteDoFornecedor(fornecedor, valorCompra) {
  if (valorCompra <= 0) return 0;
  const ganhouFreteGratis = fornecedor.gratisAcima > 0 && valorCompra >= fornecedor.gratisAcima;
  return ganhouFreteGratis ? 0 : fornecedor.frete;
}

// Fornecedor com o menor custo unitário para a peça (ou null se ninguém cotou).
function fornecedorMaisBarato(peca) {
  let melhorId = null;
  for (const fornecedor of cadastros.fornecedores) {
    const custo = peca.custos[fornecedor.id];
    if (custo > 0 && (melhorId === null || custo < peca.custos[melhorId])) {
      melhorId = fornecedor.id;
    }
  }
  return melhorId;
}

// Mantém a escolha válida; preço ausente não deve escolher um fornecedor automaticamente.
function garantirEscolhas() {
  for (const peca of orcamento.pecas) {
    if (!(peca.custos[peca.escolhido] > 0)) {
      peca.escolhido = null;
    }
  }
}

/*
  O coração da calculadora. Para cada peça com fornecedor escolhido:
  1. custo total = custo unitário × quantidade
  2. soma as compras de cada fornecedor e vê se ganhou frete grátis
  3. divide o frete entre as peças do fornecedor, proporcional ao valor de cada uma
  4. preço final = (custo + parte do frete) × (1 + margem / 100)
*/
function calcularFechamento() {
  // Passo 1: monta as linhas das peças que têm fornecedor escolhido e custo.
  const linhas = [];
  for (const peca of orcamento.pecas) {
    const fornecedor = acharFornecedor(peca.escolhido);
    const custoUnitario = peca.custos[peca.escolhido];
    if (!fornecedor || !(custoUnitario > 0)) continue;
    linhas.push({ peca, fornecedor, custoUnitario, custoTotal: custoUnitario * peca.quantidade });
  }

  // Passo 2: resumo por fornecedor (quanto vou comprar de cada um e qual o frete).
  const resumo = [];
  for (const fornecedor of cadastros.fornecedores) {
    const compra = linhas
      .filter((linha) => linha.fornecedor.id === fornecedor.id)
      .reduce((soma, linha) => soma + linha.custoTotal, 0);
    if (compra > 0) {
      resumo.push({ fornecedor, compra, frete: freteDoFornecedor(fornecedor, compra) });
    }
  }

  // Passos 3 e 4: rateio do frete e preço final de cada linha.
  for (const linha of linhas) {
    const doFornecedor = resumo.find((r) => r.fornecedor.id === linha.fornecedor.id);
    linha.frete = doFornecedor.frete * (linha.custoTotal / doFornecedor.compra);
    linha.margem = margemPara(linha.fornecedor.id, linha.peca.tipoId);

    const fator = 1 + linha.margem / 100;
    const precoCalculado = (linha.custoTotal + linha.frete) * fator;

    // Arredonda o preço unitário para centavos, e o total é unitário × quantidade.
    linha.precoUnitario = arredondar(precoCalculado / linha.peca.quantidade);
    linha.precoTotal = arredondar(linha.precoUnitario * linha.peca.quantidade);
  }

  const custo = linhas.reduce((soma, l) => soma + l.custoTotal, 0);
  const frete = resumo.reduce((soma, r) => soma + r.frete, 0);
  const cliente = linhas.reduce((soma, l) => soma + l.precoTotal, 0);

  // Peças que ainda não têm preço em nenhum fornecedor.
  const semPreco = orcamento.pecas.filter((peca) => !linhas.some((l) => l.peca === peca));

  return {
    linhas,
    resumo,
    semPreco,
    totais: { custo, frete, cliente },
  };
}


/* ---------- 4. TELAS ---------- */

// Redesenha a página inteira a partir do estado atual.
function renderizar() {
  document.querySelectorAll('[data-aba]').forEach((botao) => {
    botao.classList.toggle('ativa', botao.dataset.aba === abaPrincipal);
  });
  document.querySelectorAll('.secao').forEach((secao) => {
    secao.hidden = secao.id !== 'secao-' + abaPrincipal;
  });

  renderizarOrcamento();
  renderizarTipos();
  renderizarFornecedores();
  renderizarMargens();
}

// Monta uma tabela com rolagem lateral (para caber no celular).
function tabela(cabecalhos, linhasHtml, classe = '') {
  const ths = cabecalhos.map((c) => `<th>${c}</th>`).join('');
  return `
    <div class="tabela-rolagem">
      <table class="${classe}">
        <thead><tr>${ths}</tr></thead>
        <tbody>${linhasHtml}</tbody>
      </table>
    </div>`;
}

function opcoesDeTipo(selecionado) {
  return cadastros.tiposPeca
    .map((t) => `<option value="${escaparHtml(t.id)}" ${t.id === selecionado ? 'selected' : ''}>${escaparHtml(t.nome)}</option>`)
    .join('');
}

function opcoesDeFornecedor(selecionado) {
  return cadastros.fornecedores
    .map((f) => `<option value="${escaparHtml(f.id)}" ${f.id === selecionado ? 'selected' : ''}>${escaparHtml(f.nome)}</option>`)
    .join('');
}

function opcoesDePeca(selecionado) {
  return orcamento.pecas
    .map((peca) => `<option value="${escaparHtml(peca.id)}" ${peca.id === selecionado ? 'selected' : ''}>${escaparHtml(peca.nome)}</option>`)
    .join('');
}

// Botão de excluir que pede confirmação na própria página (sem confirm()).
function botaoExcluir(oQue, id, texto = 'Excluir') {
  return `
    <span class="confirmacao" data-excluir="${escaparHtml(oQue)}" data-id="${escaparHtml(id)}"
          data-texto="${escaparHtml(texto)}" data-pergunta="${escaparHtml(perguntaExcluir(oQue))}">
      ${botaoPedirConfirmacao(escaparHtml(texto))}
    </span>`;
}

function perguntaExcluir(oQue) {
  const perguntas = {
    peca: 'Excluir esta peça e todas as suas cotações?',
    orcamento: 'Apagar todas as peças e cotações deste orçamento?',
    fornecedor: 'Excluir este fornecedor e apagar suas cotações?',
    tipo: 'Excluir este tipo de peça?',
    excecao: 'Excluir esta exceção de margem?',
  };
  return perguntas[oQue] ?? 'Confirmar exclusão?';
}

function botaoPedirConfirmacao(texto) {
  return `<button type="button" class="botao perigo pequeno" data-passo="pedir">${texto}</button>`;
}

// --- Aba Orçamento ---

function renderizarOrcamento() {
  // Atualiza a lista de tipos no formulário, mantendo o que estava selecionado.
  const selectTipo = document.getElementById('peca-tipo');
  const tipoAtual = selectTipo.value;
  selectTipo.innerHTML = cadastros.tiposPeca.length
    ? opcoesDeTipo(tipoAtual)
    : '<option value="">Cadastre um tipo primeiro</option>';

  const selectFornecedorInicial = document.getElementById('peca-fornecedor');
  const fornecedorInicialAtual = selectFornecedorInicial.value;
  selectFornecedorInicial.innerHTML = `<option value="">Sem cotação inicial</option>${opcoesDeFornecedor(fornecedorInicialAtual)}`;

  const selectPeca = document.getElementById('custo-peca');
  const pecaAtual = selectPeca.value;
  selectPeca.innerHTML = orcamento.pecas.length
    ? opcoesDePeca(pecaAtual)
    : '<option value="">Adicione uma peça primeiro</option>';

  const selectFornecedor = document.getElementById('custo-fornecedor');
  const fornecedorAtual = selectFornecedor.value;
  selectFornecedor.innerHTML = cadastros.fornecedores.length
    ? opcoesDeFornecedor(fornecedorAtual)
    : '<option value="">Cadastre um fornecedor primeiro</option>';

  renderizarListaPecas();

  document.getElementById('conteudo-comparacao').innerHTML = htmlComparar();
}

function renderizarListaPecas() {
  const div = document.getElementById('lista-pecas');
  if (orcamento.pecas.length === 0) {
    div.innerHTML = '<p class="vazio">Nenhuma peça ainda. Adicione a primeira acima.</p>';
    return;
  }
  const linhas = orcamento.pecas.map((peca) => `
    <tr>
      <td>${escaparHtml(peca.nome)}</td>
      <td>${escaparHtml(nomeDoTipo(peca.tipoId))}</td>
      <td><input type="number" class="campo-curto" min="1" step="1" value="${peca.quantidade}"
                 data-editar="peca-qtd" data-id="${escaparHtml(peca.id)}"></td>
      <td class="acoes">${botaoExcluir('peca', peca.id)}</td>
    </tr>`).join('');
  div.innerHTML = tabela(['Peça', 'Tipo', 'Qtd', ''], linhas);
}

// Comparativo das cotações e fechamento do orçamento.
function htmlComparar() {
  if (orcamento.pecas.length === 0) {
    return '<p class="vazio">Adicione peças para comparar.</p>';
  }
  if (cadastros.fornecedores.length === 0) {
    return '<p class="vazio">Cadastre fornecedores na aba "Fornecedores".</p>';
  }

  garantirEscolhas();
  salvarOrcamento();

  const cabecalhos = [
    'Peça',
    'Qtd',
    ...cadastros.fornecedores.map((f) =>
      `${escaparHtml(f.nome)}<br><small>Entrega: ${escaparHtml(prazoEntrega(f))}</small>`
    ),
  ];
  const linhas = orcamento.pecas.map((peca) => {
    const maisBarato = fornecedorMaisBarato(peca);
    const celulas = cadastros.fornecedores.map((f) => {
      const custo = peca.custos[f.id];
      if (!(custo > 0)) return '<td class="sem-preco">—</td>';
      const classes = [
        f.id === maisBarato ? 'mais-barato' : '',
        f.id === peca.escolhido ? 'escolhido' : '',
      ].join(' ');
      return `
        <td class="${classes}">
          <label class="opcao">
            <input type="radio" name="escolha-${escaparHtml(peca.id)}" value="${escaparHtml(f.id)}"
                   ${f.id === peca.escolhido ? 'checked' : ''}
                   data-editar="escolha" data-id="${escaparHtml(peca.id)}">
            ${dinheiro(custo)}
          </label>
        </td>`;
    }).join('');
    return `<tr><td>${escaparHtml(peca.nome)}</td><td>${peca.quantidade}</td>${celulas}</tr>`;
  }).join('');

  return `
    <h3>Comparativo de custos unitários</h3>
    <p class="dica"><span class="selo verde">Verde</span> = mais barato.
      Escolha explicitamente um fornecedor para cada peça. O sistema não escolhe automaticamente; peças diferentes podem vir de fornecedores diferentes.</p>
    ${tabela(cabecalhos, linhas, 'comparativo')}
    <div class="barra-acoes">
      <button type="button" class="botao secundario" data-acao="copiar-comparativo">Copiar comparativo para superior</button>
    </div>
    ${htmlFechamento(calcularFechamento())}`;
}

function situacaoFrete(resumo) {
  const f = resumo.fornecedor;
  if (f.gratisAcima > 0 && resumo.compra >= f.gratisAcima) {
    return '<span class="selo verde">Frete grátis</span>';
  }
  if (f.gratisAcima > 0) {
    return `Faltam ${dinheiro(f.gratisAcima - resumo.compra)} para frete grátis`;
  }
  return 'Sem frete grátis';
}

function htmlFechamento(fechamento) {
  const alertaSemPreco = fechamento.semPreco.length
    ? `<p class="alerta">Sem preço em nenhum fornecedor: ${fechamento.semPreco.map((p) => escaparHtml(p.nome)).join(', ')}</p>`
    : '';

  if (fechamento.linhas.length === 0) {
    return `<h3>Fechamento</h3>${alertaSemPreco}
      <p class="vazio">Registre uma cotação para cada peça e escolha o fornecedor antes de fechar a compra.</p>`;
  }

  const linhas = fechamento.linhas.map((l) => `
    <tr>
      <td>${escaparHtml(l.peca.nome)}</td>
      <td>${l.peca.quantidade}</td>
      <td>${escaparHtml(l.fornecedor.nome)}</td>
      <td>${dinheiro(l.custoUnitario)}</td>
      <td>${dinheiro(l.frete)}</td>
      <td>${l.margem}%</td>
      <td>${dinheiro(l.precoUnitario)}</td>
      <td><strong>${dinheiro(l.precoTotal)}</strong></td>
    </tr>`).join('');

  const linhasResumo = fechamento.resumo.map((r) => `
    <tr>
      <td>${escaparHtml(r.fornecedor.nome)}</td>
      <td>${dinheiro(r.compra)}</td>
      <td>${dinheiro(r.frete)}</td>
      <td>${situacaoFrete(r)}</td>
    </tr>`).join('');

  const t = fechamento.totais;
  return `
    <h3>Fechamento</h3>
    ${alertaSemPreco}
    ${tabela(['Peça', 'Qtd', 'Fornecedor', 'Custo unit.', 'Frete rateado', 'Margem', 'Preço unit.', 'Total'], linhas)}

    <h3>Resumo por fornecedor</h3>
    ${tabela(['Fornecedor', 'Compra', 'Frete', 'Situação'], linhasResumo)}

    <div class="totais">
      <div class="total"><span>Custo das peças</span><strong>${dinheiro(t.custo)}</strong></div>
      <div class="total"><span>Frete</span><strong>${dinheiro(t.frete)}</strong></div>
      <div class="total principal"><span>Total para o cliente</span><strong>${dinheiro(t.cliente)}</strong></div>
    </div>

    <div class="barra-acoes">
      <button type="button" class="botao whatsapp" data-acao="copiar-whatsapp">Copiar para WhatsApp</button>
      <button type="button" class="botao secundario" data-acao="copiar-resumo">Copiar resumo para superior</button>
      ${botaoExcluir('orcamento', '', 'Limpar orçamento')}
    </div>`;
}

// --- Aba Tipos de peça ---

function renderizarTipos() {
  const div = document.getElementById('lista-tipos');
  if (cadastros.tiposPeca.length === 0) {
    div.innerHTML = '<p class="vazio">Nenhum tipo cadastrado.</p>';
    return;
  }
  const linhas = cadastros.tiposPeca.map((t) => `
    <tr>
      <td><input maxlength="200" value="${escaparHtml(t.nome)}" data-editar="tipo-nome" data-id="${escaparHtml(t.id)}"></td>
      <td class="acoes">${botaoExcluir('tipo', t.id)}</td>
    </tr>`).join('');
  div.innerHTML = tabela(['Nome (clique para editar)', ''], linhas);
}

// --- Aba Fornecedores ---

function renderizarFornecedores() {
  const div = document.getElementById('lista-fornecedores');
  if (cadastros.fornecedores.length === 0) {
    div.innerHTML = '<p class="vazio">Nenhum fornecedor cadastrado.</p>';
    return;
  }
  const linhas = cadastros.fornecedores.map((f) => `
    <tr>
      <td><input maxlength="200" value="${escaparHtml(f.nome)}" data-editar="fornecedor-nome" data-id="${escaparHtml(f.id)}"></td>
      <td><input type="number" min="0" step="0.01" class="campo-medio" value="${f.frete}"
                 data-editar="fornecedor-frete" data-id="${escaparHtml(f.id)}"></td>
      <td><input type="number" min="0" step="1" class="campo-curto" value="${f.prazoEntregaDias ?? ''}"
                 data-editar="fornecedor-prazo" data-id="${escaparHtml(f.id)}" aria-label="Prazo de entrega em dias"></td>
      <td><input type="number" min="0" step="0.01" class="campo-medio" value="${f.gratisAcima}"
                 data-editar="fornecedor-gratis" data-id="${escaparHtml(f.id)}"></td>
      <td class="acoes">${botaoExcluir('fornecedor', f.id)}</td>
    </tr>`).join('');
  div.innerHTML = tabela(['Nome', 'Frete (R$)', 'Prazo (dias)', 'Grátis acima de (R$)', ''], linhas);
}

// --- Aba Margens ---

function renderizarMargens() {
  const linhasTipos = cadastros.tiposPeca.map((t) => `
    <tr>
      <td>${escaparHtml(t.nome)}</td>
      <td><input type="number" min="0" step="0.1" class="campo-curto" value="${cadastros.margens[t.id] ?? 0}"
                 data-editar="margem-tipo" data-id="${escaparHtml(t.id)}"> %</td>
    </tr>`).join('');

  const linhasExcecoes = cadastros.excecoes.map((e) => `
    <tr>
      <td>${escaparHtml(acharFornecedor(e.fornecedorId)?.nome ?? '(fornecedor excluído)')}</td>
      <td>${escaparHtml(nomeDoTipo(e.tipoId))}</td>
      <td>${e.margem}%</td>
      <td class="acoes">${botaoExcluir('excecao', e.id)}</td>
    </tr>`).join('');

  document.getElementById('conteudo-margens').innerHTML = `
    <div class="cartao">
      <h2>Margem padrão por tipo de peça</h2>
      ${cadastros.tiposPeca.length
        ? tabela(['Tipo', 'Margem'], linhasTipos)
        : '<p class="vazio">Cadastre tipos de peça primeiro.</p>'}
      <p class="dica">A margem é calculada sobre o custo da peça mais o frete rateado.</p>
    </div>

    <div class="cartao">
      <h2>Exceções por fornecedor</h2>
      <p class="dica">Use quando um fornecedor específico precisa de uma margem diferente para um tipo de peça.</p>
      <div class="linha-form">
        <label class="campo"><span>Fornecedor</span>
          <select id="excecao-fornecedor">${opcoesDeFornecedor()}</select></label>
        <label class="campo"><span>Tipo</span>
          <select id="excecao-tipo">${opcoesDeTipo()}</select></label>
        <label class="campo pequeno"><span>Margem %</span>
          <input id="excecao-margem" type="number" min="0" step="0.1"></label>
        <button type="button" class="botao" data-acao="adicionar-excecao">Salvar exceção</button>
      </div>
      ${cadastros.excecoes.length
        ? tabela(['Fornecedor', 'Tipo', 'Margem', ''], linhasExcecoes)
        : '<p class="vazio">Nenhuma exceção cadastrada.</p>'}
    </div>`;
}


/* ---------- 5. AÇÕES ---------- */

function adicionarPeca(evento) {
  evento.preventDefault(); // impede o formulário de recarregar a página
  const nome = document.getElementById('peca-nome').value.trim();
  const tipoId = document.getElementById('peca-tipo').value;
  const quantidade = numeroDoCampo(document.getElementById('peca-qtd'));
  const fornecedorId = document.getElementById('peca-fornecedor').value;
  const campoCusto = document.getElementById('peca-custo').value;
  const custo = campoCusto === '' ? null : numeroDoCampo(document.getElementById('peca-custo'));

  if (!nome) return;
  if (nome.length > 200) return aviso('O nome da peça deve ter até 200 caracteres.');
  if (!acharTipo(tipoId)) return aviso('Selecione um tipo de peça válido.');
  if (!Number.isInteger(quantidade) || quantidade < 1) return aviso('A quantidade deve ser um número inteiro maior que zero.');
  if (Boolean(fornecedorId) !== Boolean(campoCusto)) {
    return aviso('Selecione o fornecedor e informe o custo juntos, ou deixe ambos vazios.');
  }
  if (fornecedorId && !acharFornecedor(fornecedorId)) return aviso('Selecione um fornecedor válido.');
  if (campoCusto && !(custo > 0)) return aviso('Digite um custo válido maior que zero.');

  const custos = fornecedorId ? { [fornecedorId]: custo } : {};
  orcamento.pecas.push({
    id: gerarId(),
    nome,
    tipoId,
    quantidade,
    custos,
    escolhido: fornecedorId || null,
  });
  salvarOrcamento();

  // Limpa os campos para a próxima peça (o tipo continua selecionado).
  document.getElementById('peca-nome').value = '';
  document.getElementById('peca-qtd').value = 1;
  document.getElementById('peca-custo').value = '';
  document.getElementById('peca-fornecedor').value = '';
  document.getElementById('peca-nome').focus();
  renderizar();
}

function registrarCusto(evento) {
  evento.preventDefault();
  const peca = acharPeca(document.getElementById('custo-peca').value);
  const fornecedor = acharFornecedor(document.getElementById('custo-fornecedor').value);
  const custo = paraNumero(document.getElementById('custo-valor').value);

  if (!peca || !fornecedor) return aviso('Selecione uma peça e um fornecedor.');
  if (!(custo > 0)) return aviso('Digite um custo válido maior que zero.');

  const custoAnterior = peca.custos[fornecedor.id];
  if (custoAnterior > 0 && custoAnterior !== custo &&
      !window.confirm(`Já existe uma cotação de ${dinheiro(custoAnterior)} para ${fornecedor.nome}. Deseja substituí-la por ${dinheiro(custo)}?`)) {
    return;
  }

  peca.custos[fornecedor.id] = custo;
  salvarOrcamento();
  document.getElementById('custo-valor').value = '';
  renderizar();
  aviso(`Custo registrado para ${fornecedor.nome}.`);
}

function adicionarTipo(evento) {
  evento.preventDefault();
  const campo = document.getElementById('tipo-nome');
  const nome = campo.value.trim();
  if (!nome) return;
  if (nome.length > 200) return aviso('O nome do tipo deve ter até 200 caracteres.');

  const jaExiste = cadastros.tiposPeca.some((t) => t.nome.toLowerCase() === nome.toLowerCase());
  if (jaExiste) return aviso('Esse tipo já existe.');

  cadastros.tiposPeca.push({ id: gerarId(), nome });
  salvarCadastros();
  campo.value = '';
  renderizar();
}

function adicionarFornecedor(evento) {
  evento.preventDefault();
  const nome = document.getElementById('fornecedor-nome').value.trim();
  const campoFrete = document.getElementById('fornecedor-frete');
  const campoPrazo = document.getElementById('fornecedor-prazo');
  const campoGratis = document.getElementById('fornecedor-gratis');
  const frete = numeroDoCampo(campoFrete);
  const prazo = numeroDoCampo(campoPrazo);
  const gratisAcima = numeroDoCampo(campoGratis);
  if (!nome) return;
  if (nome.length > 200) return aviso('O nome do fornecedor deve ter até 200 caracteres.');
  if (frete === null || frete < 0 || gratisAcima === null || gratisAcima < 0) {
    return aviso('Frete e valor mínimo para frete grátis devem ser zero ou maiores.');
  }
  if (prazo !== null && (!Number.isInteger(prazo) || prazo < 0)) {
    return aviso('O prazo deve ser um número inteiro de dias, ou ficar em branco.');
  }

  cadastros.fornecedores.push({
    id: gerarId(),
    nome,
    frete,
    prazoEntregaDias: prazo,
    gratisAcima,
  });
  salvarCadastros();
  evento.target.reset(); // limpa o formulário
  renderizar();
}

function adicionarExcecao() {
  const fornecedorId = document.getElementById('excecao-fornecedor').value;
  const tipoId = document.getElementById('excecao-tipo').value;
  const campoMargem = document.getElementById('excecao-margem').value;

  if (!acharFornecedor(fornecedorId) || !acharTipo(tipoId)) return aviso('Cadastre e selecione um fornecedor e um tipo válidos.');
  if (campoMargem === '') return aviso('Digite a margem.');

  const margem = Number(campoMargem);
  if (!Number.isFinite(margem) || margem < 0) return aviso('A margem deve ser um número igual ou maior que zero.');
  const existente = cadastros.excecoes.find((e) => e.fornecedorId === fornecedorId && e.tipoId === tipoId);
  if (existente) {
    existente.margem = margem; // se já existe, só atualiza
  } else {
    cadastros.excecoes.push({ id: gerarId(), fornecedorId, tipoId, margem });
  }
  salvarCadastros();
  renderizar();
}

// Chamado quando a pessoa clica "Sim" na confirmação de exclusão.
function excluir(oQue, id) {
  if (oQue === 'peca') {
    orcamento.pecas = orcamento.pecas.filter((p) => p.id !== id);
  }

  if (oQue === 'orcamento') {
    orcamento = { pecas: [] };
  }

  if (oQue === 'tipo') {
    cadastros.tiposPeca = cadastros.tiposPeca.filter((t) => t.id !== id);
    delete cadastros.margens[id];
    cadastros.excecoes = cadastros.excecoes.filter((e) => e.tipoId !== id);
  }

  if (oQue === 'fornecedor') {
    cadastros.fornecedores = cadastros.fornecedores.filter((f) => f.id !== id);
    cadastros.excecoes = cadastros.excecoes.filter((e) => e.fornecedorId !== id);
    // Remove os custos desse fornecedor das peças do orçamento.
    for (const peca of orcamento.pecas) {
      delete peca.custos[id];
      if (peca.escolhido === id) peca.escolhido = null;
    }
  }

  if (oQue === 'excecao') {
    cadastros.excecoes = cadastros.excecoes.filter((e) => e.id !== id);
  }

  salvarCadastros();
  salvarOrcamento();
  renderizar();
}

function textoWhatsApp(fechamento) {
  const linhas = fechamento.linhas.map((l) =>
    `• ${l.peca.quantidade}x ${l.peca.nome} — ${dinheiro(l.precoUnitario)} cada = *${dinheiro(l.precoTotal)}*`
  );
  return [
    '*Orçamento de peças*',
    '',
    ...linhas,
    '',
    `*Total: ${dinheiro(fechamento.totais.cliente)}*`,
  ].join('\n');
}

function textoResumoInterno(fechamento) {
  const linhas = fechamento.linhas.map((linha) =>
    [
      `PEÇA: ${linha.peca.nome}`,
      `Quantidade: ${linha.peca.quantidade}`,
      `Fornecedor: ${linha.fornecedor.nome}`,
      `Custo unitário: ${dinheiro(linha.custoUnitario)}`,
      `Custo das peças: ${dinheiro(linha.custoTotal)}`,
      `Frete rateado: ${dinheiro(linha.frete)}`,
      `Margem: ${linha.margem}%`,
      `Valor para o cliente: ${dinheiro(linha.precoUnitario)} por unidade`,
      `Total para o cliente: ${dinheiro(linha.precoTotal)}`,
    ].join('\n')
  );
  const fornecedores = fechamento.resumo.map((resumo) =>
    [
      `FORNECEDOR: ${resumo.fornecedor.nome}`,
      `Peças: ${dinheiro(resumo.compra)}`,
      `Frete: ${dinheiro(resumo.frete)}`,
      `Prazo de entrega: ${prazoEntrega(resumo.fornecedor)}`,
    ].join('\n')
  );
  const totais = fechamento.totais;
  const semPreco = fechamento.semPreco.length
    ? [`PEÇAS SEM COTAÇÃO ESCOLHIDA\n${fechamento.semPreco.map((peca) => `- ${peca.nome}`).join('\n')}`]
    : [];

  const divisor = '----------------------------------------';
  const secoes = [
    [
      'RESUMO INTERNO DO ORÇAMENTO',
      '================================',
      '',
      'PEÇAS E VALORES',
      '----------------',
      linhas.join(`\n\n${divisor}\n\n`),
    ].join('\n'),
    [
      'COMPRAS POR FORNECEDOR',
      '----------------------',
      fornecedores.join(`\n\n${divisor}\n\n`),
    ].join('\n'),
    [
      'TOTAIS',
      '------',
      `Custo das peças: ${dinheiro(totais.custo)}`,
      `Frete total: ${dinheiro(totais.frete)}`,
      `Total para o cliente: ${dinheiro(totais.cliente)}`,
    ].join('\n'),
    ...semPreco,
  ];

  return secoes.join(`\n\n${divisor}\n\n`);
}

function textoComparativo() {
  garantirEscolhas();
  salvarOrcamento();
  const fechamento = calcularFechamento();
  const linhaPorPeca = new Map(fechamento.linhas.map((linha) => [linha.peca.id, linha]));

  const linhas = orcamento.pecas.map((peca) => {
    const menorId = fornecedorMaisBarato(peca);
    const cotacoes = cadastros.fornecedores.map((fornecedor) => {
      const custo = peca.custos[fornecedor.id];
      const menorPreco = fornecedor.id === menorId ? ' (MENOR PREÇO)' : '';
      const valor = custo > 0 ? dinheiro(custo) + menorPreco : 'Sem cotação';
      return [
        `FORNECEDOR: ${fornecedor.nome}`,
        `Preço unitário: ${valor}`,
        `Prazo de entrega: ${prazoEntrega(fornecedor)}`,
      ].join('\n');
    });
    const fornecedorEscolhido = acharFornecedor(peca.escolhido);
    const escolhido = fornecedorEscolhido
      ? fornecedorEscolhido.nome
      : 'ainda não escolhido';
    const linhaEscolhida = linhaPorPeca.get(peca.id);
    const valoresVenda = linhaEscolhida
      ? [
        `Frete rateado: ${dinheiro(linhaEscolhida.frete)}`,
        `Margem: ${linhaEscolhida.margem}% (aplicada após o frete)`,
        `Valor para o cliente: ${dinheiro(linhaEscolhida.precoUnitario)} por unidade`,
        `Total para o cliente: ${dinheiro(linhaEscolhida.precoTotal)}`,
      ].join('\n')
      : 'Frete rateado: —\nMargem: —\nValor para o cliente: —';
    const divisor = '----------------------------------------';
    return [
      `PEÇA: ${peca.nome}\nQuantidade: ${peca.quantidade}`,
      `COTAÇÕES\n\n${cotacoes.join(`\n\n${divisor}\n\n`)}`,
      `FORNECEDOR ESCOLHIDO PARA COMPRA: ${escolhido}\n\nVALORES PARA O CLIENTE\n${valoresVenda}`,
    ].join('\n\n');
  });

  const divisor = '========================================';
  return [
    'COMPARATIVO DE COTAÇÕES DE PEÇAS',
    divisor,
    'Cotações por fornecedor são unitárias. Os valores para o cliente consideram o fornecedor escolhido, frete rateado e margem.',
    '',
    linhas.join(`\n\n${divisor}\n\n`),
    '',
    'TOTAIS DA COMPRA ESCOLHIDA',
    '--------------------------',
    `Custo das peças: ${dinheiro(fechamento.totais.custo)}`,
    `Frete total: ${dinheiro(fechamento.totais.frete)}`,
    `Total para o cliente: ${dinheiro(fechamento.totais.cliente)}`,
  ].join('\n\n');
}

async function copiarTexto(texto) {
  const textoFormatado = texto.replace(/\r?\n/g, '\r\n');
  try {
    await navigator.clipboard.writeText(textoFormatado);
  } catch (erroAreaTransferencia) {
    const area = document.createElement('textarea');
    area.value = textoFormatado;
    document.body.appendChild(area);
    area.select();
    try {
      if (!document.execCommand('copy')) {
        throw new Error('O navegador não permitiu copiar para a área de transferência.');
      }
    } finally {
      area.remove();
    }
  }
}

async function copiarParaWhatsApp() {
  const fechamento = calcularFechamento();
  if (fechamento.linhas.length === 0) return aviso('Nenhuma peça com preço para copiar.');

  try {
    await copiarTexto(textoWhatsApp(fechamento));
  } catch (erro) {
    console.error('Não foi possível copiar o orçamento para o WhatsApp.', erro);
    return aviso('Não foi possível copiar. Tente novamente.');
  }
  aviso(fechamento.semPreco.length
    ? 'Copiado! Atenção: algumas peças sem preço ficaram de fora.'
    : 'Copiado! Agora é só colar no WhatsApp.');
}

async function copiarResumoInterno() {
  const fechamento = calcularFechamento();
  if (fechamento.linhas.length === 0) return aviso('Nenhuma peça com preço para copiar.');

  try {
    await copiarTexto(textoResumoInterno(fechamento));
  } catch (erro) {
    console.error('Não foi possível copiar o resumo interno.', erro);
    return aviso('Não foi possível copiar. Tente novamente.');
  }
  aviso('Resumo interno copiado.');
}

async function copiarComparativo() {
  const temCotacao = orcamento.pecas.some((peca) =>
    cadastros.fornecedores.some((fornecedor) => peca.custos[fornecedor.id] > 0)
  );
  if (!temCotacao) return aviso('Adicione pelo menos uma cotação antes de copiar.');

  try {
    await copiarTexto(textoComparativo());
  } catch (erro) {
    console.error('Não foi possível copiar o comparativo de cotações.', erro);
    return aviso('Não foi possível copiar. Tente novamente.');
  }
  aviso('Comparativo copiado para enviar ao seu superior.');
}

function exportarBackup() {
  let url;
  try {
    const backup = {
      versao: 1,
      exportadoEm: new Date().toISOString(),
      cadastros,
      orcamento,
    };
    const arquivo = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    url = URL.createObjectURL(arquivo);
    const link = document.createElement('a');
    link.href = url;
    link.download = `backup-calculadora-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    aviso('Backup baixado. Guarde o arquivo em um local seguro.');
  } catch (erro) {
    console.error('Não foi possível exportar o backup.', erro);
    aviso('Não foi possível baixar o backup.');
  } finally {
    if (url) URL.revokeObjectURL(url);
  }
}

function validarBackup(backup) {
  const objeto = (valor) => valor !== null && typeof valor === 'object' && !Array.isArray(valor);
  const textoValido = (valor) => typeof valor === 'string' && valor.trim().length > 0 && valor.length <= 200;
  const idValido = (valor) => typeof valor === 'string' && /^[a-zA-Z0-9_-]{1,100}$/.test(valor);
  const numeroNaoNegativo = (valor) => Number.isFinite(valor) && valor >= 0;
  if (!objeto(backup) || backup.versao !== 1 || !objeto(backup.cadastros) || !objeto(backup.orcamento)) {
    throw new Error('Formato ou versão de backup inválidos.');
  }

  const novosCadastros = backup.cadastros;
  const novoOrcamento = backup.orcamento;
  if (!Array.isArray(novosCadastros.tiposPeca) || !Array.isArray(novosCadastros.fornecedores) ||
      !Array.isArray(novosCadastros.excecoes) || !objeto(novosCadastros.margens) ||
      !Array.isArray(novoOrcamento.pecas)) {
    throw new Error('O backup não contém todos os dados necessários.');
  }

  const idsTipos = new Set();
  for (const tipo of novosCadastros.tiposPeca) {
    if (!objeto(tipo) || !idValido(tipo.id) || !textoValido(tipo.nome) || idsTipos.has(tipo.id)) {
      throw new Error('Há tipos de peça inválidos ou duplicados no backup.');
    }
    idsTipos.add(tipo.id);
  }

  const idsFornecedores = new Set();
  for (const fornecedor of novosCadastros.fornecedores) {
    const prazoValido = fornecedor?.prazoEntregaDias == null ||
      (Number.isInteger(fornecedor.prazoEntregaDias) && fornecedor.prazoEntregaDias >= 0);
    if (!objeto(fornecedor) || !idValido(fornecedor.id) || !textoValido(fornecedor.nome) ||
        idsFornecedores.has(fornecedor.id) || !numeroNaoNegativo(fornecedor.frete) ||
        !numeroNaoNegativo(fornecedor.gratisAcima) || !prazoValido) {
      throw new Error('Há fornecedores inválidos ou duplicados no backup.');
    }
    idsFornecedores.add(fornecedor.id);
  }

  for (const [tipoId, margem] of Object.entries(novosCadastros.margens)) {
    if (!idsTipos.has(tipoId) || !numeroNaoNegativo(margem)) {
      throw new Error('Há margens inválidas no backup.');
    }
  }

  const idsExcecoes = new Set();
  const combinacoesExcecao = new Set();
  for (const excecao of novosCadastros.excecoes) {
    const combinacao = `${excecao?.fornecedorId}:${excecao?.tipoId}`;
    if (!objeto(excecao) || !idValido(excecao.id) || idsExcecoes.has(excecao.id) ||
        !idsFornecedores.has(excecao.fornecedorId) || !idsTipos.has(excecao.tipoId) ||
        !numeroNaoNegativo(excecao.margem) || combinacoesExcecao.has(combinacao)) {
      throw new Error('Há exceções de margem inválidas no backup.');
    }
    idsExcecoes.add(excecao.id);
    combinacoesExcecao.add(combinacao);
  }

  const idsPecas = new Set();
  for (const peca of novoOrcamento.pecas) {
    if (!objeto(peca) || !idValido(peca.id) || !textoValido(peca.nome) || !textoValido(peca.tipoId) ||
        idsPecas.has(peca.id) || !Number.isInteger(peca.quantidade) || peca.quantidade < 1 ||
        !objeto(peca.custos) || !(peca.escolhido == null || idsFornecedores.has(peca.escolhido))) {
      throw new Error('Há peças inválidas ou duplicadas no backup.');
    }
    idsPecas.add(peca.id);
    for (const [fornecedorId, custo] of Object.entries(peca.custos)) {
      if (!idsFornecedores.has(fornecedorId) || !Number.isFinite(custo) || custo <= 0) {
        throw new Error('Há custos inválidos no backup.');
      }
    }
  }

  return { cadastros: novosCadastros, orcamento: novoOrcamento };
}

function restaurarBackupNoArmazenamento(novosCadastros, novoOrcamento) {
  const conteudoAnterior = {
    cadastros: localStorage.getItem(CHAVE_CADASTROS),
    orcamento: localStorage.getItem(CHAVE_ORCAMENTO),
  };
  try {
    localStorage.setItem(CHAVE_CADASTROS, JSON.stringify(novosCadastros));
    localStorage.setItem(CHAVE_ORCAMENTO, JSON.stringify(novoOrcamento));
  } catch (erro) {
    try {
      if (conteudoAnterior.cadastros === null) localStorage.removeItem(CHAVE_CADASTROS);
      else localStorage.setItem(CHAVE_CADASTROS, conteudoAnterior.cadastros);
      if (conteudoAnterior.orcamento === null) localStorage.removeItem(CHAVE_ORCAMENTO);
      else localStorage.setItem(CHAVE_ORCAMENTO, conteudoAnterior.orcamento);
    } catch (erroRollback) {
      console.error('Não consegui reverter o armazenamento após falha ao importar backup.', erroRollback);
      const erroRestauracao = new Error('A restauração falhou e o armazenamento anterior não pôde ser recuperado.');
      erroRestauracao.rollbackFalhou = true;
      throw erroRestauracao;
    }
    throw erro;
  }
}

async function importarBackup() {
  const campoArquivo = document.getElementById('arquivo-backup');
  const arquivo = campoArquivo.files[0];
  if (!arquivo) return aviso('Selecione um arquivo de backup primeiro.');
  if (arquivo.size > 5 * 1024 * 1024) return aviso('O arquivo de backup excede o limite de 5 MB.');
  if (!window.confirm('Restaurar este backup substituirá os cadastros e o orçamento atuais. Deseja continuar?')) {
    campoArquivo.value = '';
    return;
  }

  try {
    const backup = JSON.parse(await arquivo.text());
    const dados = validarBackup(backup);
    restaurarBackupNoArmazenamento(dados.cadastros, dados.orcamento);
    cadastros = dados.cadastros;
    orcamento = dados.orcamento;
    renderizar();
    aviso('Backup restaurado com sucesso.');
  } catch (erro) {
    console.error('Não foi possível restaurar o backup.', erro);
    aviso(erro.rollbackFalhou
      ? 'Falha ao restaurar e recuperar os dados anteriores. Verifique o armazenamento antes de continuar.'
      : 'Backup inválido ou não foi possível restaurar. Os dados atuais foram mantidos.');
  } finally {
    campoArquivo.value = '';
  }
}


/* ---------- 6. EVENTOS ---------- */

/*
  Em vez de colocar um "ouvinte" em cada botão, colocamos UM no documento inteiro
  e olhamos em qual elemento a pessoa clicou (isso se chama "delegação de eventos").
  Assim funciona até para botões criados depois pelo renderizar().
*/
function aoClicar(evento) {
  const alvo = evento.target;

  const botaoAba = alvo.closest('[data-aba]');
  if (botaoAba) {
    abaPrincipal = botaoAba.dataset.aba;
    return renderizar();
  }

  // Confirmação de exclusão em 2 passos: "Excluir" -> "Tem certeza? Sim / Não"
  const botaoPasso = alvo.closest('[data-passo]');
  if (botaoPasso) {
    const caixa = botaoPasso.closest('.confirmacao');
    const passo = botaoPasso.dataset.passo;
    if (passo === 'pedir') {
      caixa.replaceChildren();
      const pergunta = document.createElement('span');
      pergunta.className = 'pergunta';
      pergunta.textContent = caixa.dataset.pergunta || 'Confirmar exclusão?';
      const confirmar = document.createElement('button');
      confirmar.type = 'button';
      confirmar.className = 'botao perigo pequeno';
      confirmar.dataset.passo = 'sim';
      confirmar.textContent = 'Sim';
      const cancelar = document.createElement('button');
      cancelar.type = 'button';
      cancelar.className = 'botao secundario pequeno';
      cancelar.dataset.passo = 'nao';
      cancelar.textContent = 'Não';
      caixa.append(pergunta, confirmar, cancelar);
    } else if (passo === 'nao') {
      const botao = document.createElement('button');
      botao.type = 'button';
      botao.className = 'botao perigo pequeno';
      botao.dataset.passo = 'pedir';
      botao.textContent = caixa.dataset.texto || 'Excluir';
      caixa.replaceChildren(botao);
    } else if (passo === 'sim') {
      excluir(caixa.dataset.excluir, caixa.dataset.id);
    }
    return;
  }

  const botaoAcao = alvo.closest('[data-acao]');
  if (botaoAcao?.dataset.acao === 'copiar-whatsapp') return copiarParaWhatsApp();
  if (botaoAcao?.dataset.acao === 'copiar-resumo') return copiarResumoInterno();
  if (botaoAcao?.dataset.acao === 'copiar-comparativo') return copiarComparativo();
  if (botaoAcao?.dataset.acao === 'exportar-backup') return exportarBackup();
  if (botaoAcao?.dataset.acao === 'importar-backup') return importarBackup();
  if (botaoAcao?.dataset.acao === 'adicionar-excecao') return adicionarExcecao();
}

// "change" acontece quando a pessoa termina de editar um campo (sai dele ou aperta Enter).
function aoAlterar(evento) {
  const campo = evento.target;
  const id = campo.dataset.id;

  switch (campo.dataset.editar) {
    case 'peca-qtd': {
      const peca = acharPeca(id);
      const quantidade = numeroDoCampo(campo);
      if (!peca) return;
      if (!Number.isInteger(quantidade) || quantidade < 1) {
        campo.value = peca.quantidade;
        return aviso('A quantidade deve ser um número inteiro maior que zero.');
      }
      peca.quantidade = quantidade;
      salvarOrcamento();
      renderizar();
      break;
    }

    case 'escolha': {
      const peca = acharPeca(id);
      const fornecedor = acharFornecedor(campo.value);
      if (!peca || !fornecedor || !(peca.custos[fornecedor.id] > 0)) {
        renderizar();
        return aviso('Não foi possível selecionar essa cotação.');
      }
      peca.escolhido = fornecedor.id;
      salvarOrcamento();
      renderizar();
      break;
    }

    case 'tipo-nome': {
      const tipo = acharTipo(id);
      if (!tipo) return;
      const nome = campo.value.trim();
      if (!nome || nome.length > 200) {
        campo.value = tipo.nome;
        return aviso('O nome do tipo deve ter entre 1 e 200 caracteres.');
      }
      tipo.nome = nome;
      salvarCadastros();
      break;
    }

    case 'fornecedor-nome': {
      const fornecedor = acharFornecedor(id);
      if (!fornecedor) return;
      const nome = campo.value.trim();
      if (!nome || nome.length > 200) {
        campo.value = fornecedor.nome;
        return aviso('O nome do fornecedor deve ter entre 1 e 200 caracteres.');
      }
      fornecedor.nome = nome;
      salvarCadastros();
      break;
    }

    case 'fornecedor-frete': {
      const fornecedor = acharFornecedor(id);
      const frete = numeroDoCampo(campo);
      if (!fornecedor) return;
      if (frete === null || frete < 0) {
        campo.value = fornecedor.frete;
        return aviso('O frete deve ser um valor igual ou maior que zero.');
      }
      fornecedor.frete = frete;
      salvarCadastros();
      break;
    }

    case 'fornecedor-prazo': {
      const prazo = campo.value === '' ? null : Number(campo.value);
      const fornecedor = acharFornecedor(id);
      if (!fornecedor) return;
      if (prazo !== null && (!Number.isInteger(prazo) || prazo < 0)) {
        campo.value = fornecedor.prazoEntregaDias ?? '';
        return aviso('Informe o prazo em dias inteiros, ou deixe em branco.');
      }
      fornecedor.prazoEntregaDias = prazo;
      salvarCadastros();
      renderizar();
      break;
    }

    case 'fornecedor-gratis': {
      const fornecedor = acharFornecedor(id);
      const valor = numeroDoCampo(campo);
      if (!fornecedor) return;
      if (valor === null || valor < 0) {
        campo.value = fornecedor.gratisAcima;
        return aviso('O valor mínimo deve ser igual ou maior que zero.');
      }
      fornecedor.gratisAcima = valor;
      salvarCadastros();
      break;
    }

    case 'margem-tipo': {
      const margemAnterior = cadastros.margens[id] ?? 0;
      const margem = numeroDoCampo(campo);
      if (!acharTipo(id)) return;
      if (margem === null || margem < 0) {
        campo.value = margemAnterior;
        return aviso('A margem deve ser um número igual ou maior que zero.');
      }
      cadastros.margens[id] = margem;
      salvarCadastros();
      break;
    }

  }
}

document.getElementById('form-peca').addEventListener('submit', adicionarPeca);
document.getElementById('form-custo').addEventListener('submit', registrarCusto);
document.getElementById('form-tipo').addEventListener('submit', adicionarTipo);
document.getElementById('form-fornecedor').addEventListener('submit', adicionarFornecedor);
document.addEventListener('click', aoClicar);
document.addEventListener('change', aoAlterar);

// Desenha a tela pela primeira vez.
try {
  validarBackup({ versao: 1, cadastros, orcamento });
} catch (erro) {
  console.error('Os dados salvos estão incompletos ou inválidos.', erro);
  erroLeituraDados = true;
  cadastros = structuredClone(CADASTROS_INICIAIS);
  orcamento = { pecas: [] };
}
renderizar();
if (erroLeituraDados) {
  aviso('Não foi possível ler os dados salvos. Eles foram preservados; restaure um backup ou verifique o armazenamento do navegador.');
}
