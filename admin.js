
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

const SUPABASE_URL = "https://fqmwhuxtnmkigqzxvvdr.supabase.co";
const SUPABASE_KEY = "sb_publishable_Y9G1dFENVRTQCpJXgoo8BQ_D6KUlhJY";

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const $ = id => document.getElementById(id);

const loginEl = $("login");
const dashboardEl = $("dashboard");
const formLogin = $("form-login");
const mensagemLogin = $("mensagem-login");
const botaoSair = $("btn-sair");

let restauranteId = null;
let utilizadorAtual = null;
let membroAtual = null;
let pedidosAtuais = [];
let canalPedidos = null;

const estados = {
    novo: "Novo",
    confirmado: "Confirmado",
    em_preparacao: "Em preparação",
    pronto: "Pronto",
    entregue: "Entregue",
    cancelado: "Cancelado"
};

const papeis = {
    dono: "Dono",
    gerente: "Gerente",
    caixa: "Caixa",
    cozinha: "Cozinha",
    empregado: "Empregado"
};

const metodosPagamento = {
    dinheiro: "Dinheiro",
    cartao: "Cartão",
    mpesa: "M-Pesa",
    emola: "e-Mola",
    outro: "Outro"
};

function temPapel(...permitidos) {
    return permitidos.includes(membroAtual?.papel);
}

function formatarDinheiro(centavos) {
    return (Number(centavos || 0) / 100).toLocaleString("pt-MZ", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    }) + " MT";
}

function formatarData(data) {
    return new Date(data).toLocaleString("pt-MZ");
}

function elemento(tag, classe, texto) {
    const el = document.createElement(tag);
    if (classe) el.className = classe;
    if (texto !== undefined) el.textContent = texto;
    return el;
}

function botao(texto, classe, acao) {
    const el = elemento("button", classe, texto);
    el.type = "button";
    el.addEventListener("click", acao);
    return el;
}

function mensagem(container, texto) {
    container.replaceChildren(elemento("p", "mensagem", texto));
}

function mostrarLogin() {
    loginEl.hidden = false;
    dashboardEl.hidden = true;
    botaoSair.hidden = true;
}

function mostrarDashboard() {
    loginEl.hidden = true;
    dashboardEl.hidden = false;
    botaoSair.hidden = false;
}

function mostrarMensagem(texto) {
    mensagemLogin.textContent = texto;
}

// --------------------------------------------------
// AUTENTICAÇÃO
// --------------------------------------------------

formLogin.addEventListener("submit", async evento => {
    evento.preventDefault();

    mostrarMensagem("A verificar acesso...");

    const email = $("email").value.trim();
    const senha = $("senha").value;

    const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password: senha
    });

    if (error) {
        mostrarMensagem("E-mail ou palavra-passe incorretos.");
        console.error(error);
        return;
    }

    await iniciarPainel(data.user);
});

async function iniciarPainel(utilizador) {
    utilizadorAtual = utilizador;

    const { data: membro, error } = await supabase
        .from("membros_equipa")
        .select("id, restaurante_id, nome, papel, ativo")
        .eq("user_id", utilizador.id)
        .eq("ativo", true)
        .maybeSingle();

    if (error || !membro) {
        mostrarLogin();
        mostrarMensagem("Esta conta não tem acesso autorizado.");
        await supabase.auth.signOut();
        console.error(error);
        return;
    }

    membroAtual = membro;
    restauranteId = membro.restaurante_id;

    $("boas-vindas").textContent =
        "Bem-vindo, " + membro.nome + " · " +
        (papeis[membro.papel] || membro.papel);

    mostrarDashboard();
    configurarNavegacao();
    configurarPermissoes();

    await carregarPedidos();
    await carregarCardapio();
    await carregarMesas();

    if (temPapel("dono")) {
        await carregarEquipa();
    }

    if (temPapel("dono", "gerente")) {
        await carregarHistorico();
    }

    iniciarTempoReal();
}

// --------------------------------------------------
// NAVEGAÇÃO
// --------------------------------------------------

function configurarNavegacao() {
    document.querySelectorAll(".nav-btn").forEach(botaoNav => {
        botaoNav.addEventListener("click", () => {
            const nome = botaoNav.dataset.secao;

            document.querySelectorAll("#dashboard > .secao, #dashboard .secao")
                .forEach(secao => {
                    if (secao.id.startsWith("secao-")) {
                        secao.hidden = true;
                    }
                });

            const destino = $("secao-" + nome);

            if (destino) {
                destino.hidden = false;
            }

            document.querySelectorAll(".nav-btn").forEach(b => {
                b.classList.remove("ativo");
                b.removeAttribute("aria-current");
            });

            botaoNav.classList.add("ativo");
            botaoNav.setAttribute("aria-current", "page");
        });
    });

    const primeira = document.querySelector('.nav-btn[data-secao="pedidos"]');
    if (primeira) primeira.click();
}

function configurarPermissoes() {
    const podeGerir = temPapel("dono", "gerente");

    const navEquipa = document.querySelector('[data-secao="equipa"]');
    const navHistorico = document.querySelector('[data-secao="historico"]');

    if (navEquipa) navEquipa.hidden = !temPapel("dono");
    if (navHistorico) navHistorico.hidden = !podeGerir;

    if ($("secao-equipa")) $("secao-equipa").hidden = !temPapel("dono");
    if ($("secao-historico")) $("secao-historico").hidden = !podeGerir;
}

// --------------------------------------------------
// PEDIDOS
// --------------------------------------------------

async function carregarPedidos() {
    if (!restauranteId) return;

    const container = $("lista-pedidos");
    mensagem(container, "A carregar pedidos...");

    const { data, error } = await supabase
        .from("pedidos")
        .select(`
            id,
            numero,
            estado,
            estado_pagamento,
            total_centavos,
            nome_cliente,
            nota,
            criado_em,
            mesa_id
        `)
        .eq("restaurante_id", restauranteId)
        .order("criado_em", { ascending: false })
        .limit(50);

    if (error) {
        mensagem(container, "Não foi possível carregar os pedidos.");
        console.error(error);
        return;
    }

    pedidosAtuais = data || [];

    atualizarResumo(pedidosAtuais);
    await mostrarPedidos(pedidosAtuais);
}

function atualizarResumo(pedidos) {
    $("pedidos-novos").textContent =
        pedidos.filter(p => p.estado === "novo").length;

    $("pedidos-preparacao").textContent =
        pedidos.filter(p => p.estado === "em_preparacao").length;

    $("pedidos-prontos").textContent =
        pedidos.filter(p => p.estado === "pronto").length;
}

async function mostrarPedidos(pedidos) {
    const container = $("lista-pedidos");
    container.replaceChildren();

    const filtro = $("filtro-estado")?.value || "todos";

    const filtrados = filtro === "todos"
        ? pedidos
        : pedidos.filter(p => p.estado === filtro);

    if (!filtrados.length) {
        mensagem(container, "Não existem pedidos neste estado.");
        return;
    }

    const ids = filtrados.map(p => p.id);
    const mesasIds = [...new Set(filtrados.map(p => p.mesa_id))];

    const [{ data: itens, error: erroItens }, { data: mesas }] =
        await Promise.all([
            supabase
                .from("itens_pedido")
                .select("pedido_id,nome_produto,quantidade,preco_unit_centavos,nota")
                .in("pedido_id", ids),

            supabase
                .from("mesas")
                .select("id,nome")
                .in("id", mesasIds)
        ]);

    if (erroItens) {
        mensagem(container, "Não foi possível carregar os itens dos pedidos.");
        console.error(erroItens);
        return;
    }

    const mapaMesas = new Map((mesas || []).map(m => [m.id, m.nome]));

    filtrados.forEach(pedido => {
        const cartao = elemento("article", "pedido");

        cartao.appendChild(elemento("h3", "", "Pedido #" + pedido.numero));
        cartao.appendChild(elemento("p", "", "Mesa: " +
            (mapaMesas.get(pedido.mesa_id) || "Mesa não identificada")));

        cartao.appendChild(elemento("p", "", "Cliente: " +
            (pedido.nome_cliente || "Não identificado")));

        cartao.appendChild(elemento("p", "", "Estado: " +
            (estados[pedido.estado] || pedido.estado)));

        cartao.appendChild(elemento("p", "", "Pagamento: " +
            pedido.estado_pagamento));

        cartao.appendChild(elemento("p", "", "Total: " +
            formatarDinheiro(pedido.total_centavos)));

        cartao.appendChild(elemento("p", "", "Data: " +
            formatarData(pedido.criado_em)));

        const listaItens = elemento("div", "itens-pedido");
        listaItens.appendChild(elemento("strong", "", "Produtos"));

        (itens || [])
            .filter(item => item.pedido_id === pedido.id)
            .forEach(item => {
                const linha = elemento(
                    "p",
                    "",
                    item.quantidade + " × " + item.nome_produto +
                    " — " + formatarDinheiro(item.preco_unit_centavos * item.quantidade)
                );

                if (item.nota) {
                    linha.textContent += " · Nota: " + item.nota;
                }

                listaItens.appendChild(linha);
            });

        cartao.appendChild(listaItens);

        if (pedido.nota) {
            cartao.appendChild(elemento("p", "", "Observações: " + pedido.nota));
        }

        const acoes = elemento("div", "acoes");

        const proximo = {
            novo: "confirmado",
            confirmado: "em_preparacao",
            em_preparacao: "pronto",
            pronto: "entregue"
        }[pedido.estado];

        const podeAvancar = {
            confirmado: temPapel("empregado", "caixa", "gerente", "dono"),
            em_preparacao: temPapel("cozinha", "gerente", "dono"),
            pronto: temPapel("cozinha", "gerente", "dono"),
            entregue: temPapel("empregado", "gerente", "dono")
        };

        if (proximo && podeAvancar[proximo]) {
            acoes.appendChild(botao(
                "Avançar: " + estados[proximo],
                "botao-secundario",
                () => mudarEstado(pedido.id, proximo)
            ));
        }

        const podeCancelar =
            (pedido.estado === "novo" &&
                temPapel("empregado", "caixa", "gerente", "dono")) ||
            (["confirmado", "em_preparacao", "pronto"].includes(pedido.estado) &&
                temPapel("gerente", "dono"));

        if (podeCancelar) {
            acoes.appendChild(botao(
                "Cancelar pedido",
                "botao-perigo",
                () => cancelarPedido(pedido.id)
            ));
        }

        if (pedido.estado_pagamento === "pendente" &&
            ["confirmado", "em_preparacao", "pronto", "entregue"].includes(pedido.estado) &&
            temPapel("caixa", "gerente", "dono")) {

            acoes.appendChild(botao(
                "Confirmar pagamento",
                "botao-sucesso",
                () => confirmarPagamento(pedido.id)
            ));
        }

        if (pedido.estado_pagamento === "pago" &&
            temPapel("gerente", "dono")) {

            acoes.appendChild(botao(
                "Anular pagamento",
                "botao-perigo",
                () => anularPagamento(pedido.id)
            ));
        }

        if (acoes.children.length) cartao.appendChild(acoes);

        container.appendChild(cartao);
    });
}

async function mudarEstado(pedidoId, novoEstado) {
    const motivo = novoEstado === "cancelado"
        ? prompt("Indica o motivo do cancelamento:")
        : null;

    if (novoEstado === "cancelado" && !motivo?.trim()) {
        alert("O motivo é obrigatório.");
        return;
    }

    const { error } = await supabase.rpc("mudar_estado_pedido", {
        p_pedido_id: pedidoId,
        p_novo: novoEstado,
        p_motivo: motivo
    });

    if (error) {
        alert("Não foi possível atualizar: " + error.message);
        console.error(error);
        return;
    }

    await carregarPedidos();
}

async function cancelarPedido(pedidoId) {
    await mudarEstado(pedidoId, "cancelado");
}

// --------------------------------------------------
// PAGAMENTOS
// --------------------------------------------------

async function confirmarPagamento(pedidoId) {
    const metodo = prompt(
        "Método de pagamento:\n1 - Dinheiro\n2 - Cartão\n3 - M-Pesa\n4 - e-Mola\n5 - Outro"
    );

    const opcoes = {
        "1": "dinheiro",
        "2": "cartao",
        "3": "mpesa",
        "4": "emola",
        "5": "outro"
    };

    const escolhido = opcoes[metodo];

    if (!escolhido) {
        alert("Método inválido.");
        return;
    }

    if (!confirm("Confirmas que recebeste o pagamento?")) return;

    const { error } = await supabase.rpc("confirmar_pagamento", {
        p_pedido_id: pedidoId,
        p_metodo: escolhido
    });

    if (error) {
        alert("Não foi possível confirmar o pagamento: " + error.message);
        console.error(error);
        return;
    }

    alert("Pagamento registado.");
    await carregarPedidos();
}

async function anularPagamento(pedidoId) {
    const motivo = prompt("Motivo da anulação do pagamento:");

    if (!motivo?.trim()) {
        alert("O motivo é obrigatório.");
        return;
    }

    if (!confirm("Tens a certeza de que queres anular este pagamento?")) return;

    const { error } = await supabase.rpc("anular_pagamento", {
        p_pedido_id: pedidoId,
        p_motivo: motivo
    });

    if (error) {
        alert("Não foi possível anular o pagamento: " + error.message);
        console.error(error);
        return;
    }

    await carregarPedidos();
}

// --------------------------------------------------
// CARDÁPIO
// --------------------------------------------------

async function carregarCardapio() {
    const container = $("gestao-cardapio");
    if (!container || !restauranteId) return;

    container.replaceChildren();

    const podeGerir = temPapel("dono", "gerente");

    const { data: categorias, error } = await supabase
        .from("categorias")
        .select("id,nome,ordem,visivel")
        .eq("restaurante_id", restauranteId)
        .order("ordem");

    if (error) {
        mensagem(container, "Não foi possível carregar as categorias.");
        console.error(error);
        return;
    }

    const { data: produtos, error: erroProdutos } = await supabase
        .from("produtos")
        .select("id,categoria_id,nome,descricao,preco_centavos,disponivel,destaque,arquivado")
        .eq("restaurante_id", restauranteId)
        .order("ordem");

    if (erroProdutos) {
        mensagem(container, "Não foi possível carregar os produtos.");
        console.error(erroProdutos);
        return;
    }

    if (podeGerir) {
        container.appendChild(botao("Nova categoria", "botao-secundario", criarCategoria));
        container.appendChild(botao("Novo produto", "", () => criarProduto(categorias || [])));
    }

    (categorias || []).forEach(categoria => {
        const bloco = elemento("article", "item-gestao");
        bloco.appendChild(elemento("h3", "", categoria.nome));
        bloco.appendChild(elemento("p", "", categoria.visivel ? "Visível" : "Oculta"));

        if (podeGerir) {
            bloco.appendChild(botao(
                "Editar categoria",
                "botao-secundario",
                () => editarCategoria(categoria)
            ));

            bloco.appendChild(botao(
                "Eliminar categoria",
                "botao-perigo",
                () => eliminarCategoria(categoria)
            ));
        }

        (produtos || [])
            .filter(p => p.categoria_id === categoria.id)
            .forEach(produto => {
                if (produto.arquivado) return;

                const item = elemento("div", "produto-gestao");

                item.appendChild(elemento("h3", "", produto.nome));
                item.appendChild(elemento("p", "", produto.descricao || ""));
                item.appendChild(elemento("p", "", formatarDinheiro(produto.preco_centavos)));
                item.appendChild(elemento("p", "", produto.disponivel ? "Disponível" : "Indisponível"));

                if (podeGerir) {
                    item.appendChild(botao(
                        "Editar",
                        "botao-secundario",
                        () => editarProduto(produto, categorias)
                    ));

                    item.appendChild(botao(
                        produto.disponivel ? "Marcar esgotado" : "Disponibilizar",
                        "",
                        () => alterarDisponibilidade(produto)
                    ));

                    item.appendChild(botao(
                        "Arquivar",
                        "botao-perigo",
                        () => arquivarProduto(produto)
                    ));
                }

                bloco.appendChild(item);
            });

        container.appendChild(bloco);
    });
}

async function criarCategoria() {
    const nome = prompt("Nome da nova categoria:");
    if (!nome?.trim()) return;

    const { error } = await supabase.from("categorias").insert({
        restaurante_id: restauranteId,
        nome: nome.trim(),
        ordem: 0,
        visivel: true
    });

    if (error) {
        alert("Erro ao criar categoria: " + error.message);
        return;
    }

    await carregarCardapio();
}

async function editarCategoria(categoria) {
    const nome = prompt("Nome da categoria:", categoria.nome);
    if (!nome?.trim()) return;

    const { error } = await supabase
        .from("categorias")
        .update({ nome: nome.trim() })
        .eq("id", categoria.id)
        .eq("restaurante_id", restauranteId);

    if (error) {
        alert("Erro: " + error.message);
        return;
    }

    await carregarCardapio();
}

async function eliminarCategoria(categoria) {
    if (!confirm("Eliminar a categoria " + categoria.nome + "?")) return;

    const { error } = await supabase
        .from("categorias")
        .delete()
        .eq("id", categoria.id)
        .eq("restaurante_id", restauranteId);

    if (error) {
        alert("Não foi possível eliminar. Verifica se ainda existem produtos nesta categoria.");
        console.error(error);
        return;
    }

    await carregarCardapio();
}

async function criarProduto(categorias) {
    if (!categorias.length) {
        alert("Cria primeiro uma categoria.");
        return;
    }

    const nome = prompt("Nome do produto:");
    if (!nome?.trim()) return;

    const descricao = prompt("Descrição do produto:") || "";
    const preco = Number(prompt("Preço em MT:"));

    if (!Number.isFinite(preco) || preco < 0 || preco > 100000) {
        alert("Preço inválido.");
        return;
    }

    const categoriaEscolhida = prompt(
        "Indica o número da categoria:\n" +
        categorias.map((c, i) => `${i + 1} - ${c.nome}`).join("\n")
    );

    const categoria = categorias[Number(categoriaEscolhida) - 1];

    if (!categoria) {
        alert("Categoria inválida.");
        return;
    }

    const { error } = await supabase.from("produtos").insert({
        restaurante_id: restauranteId,
        categoria_id: categoria.id,
        nome: nome.trim(),
        descricao: descricao.trim(),
        preco_centavos: Math.round(preco * 100),
        disponivel: true,
        destaque: false,
        ordem: 0,
        arquivado: false
    });

    if (error) {
        alert("Erro ao criar produto: " + error.message);
        console.error(error);
        return;
    }

    await carregarCardapio();
}

async function editarProduto(produto, categorias) {
    const nome = prompt("Nome:", produto.nome);
    if (!nome?.trim()) return;

    const descricao = prompt("Descrição:", produto.descricao || "");
    const preco = Number(prompt(
        "Preço em MT:",
        (produto.preco_centavos / 100).toFixed(2)
    ));

    if (!Number.isFinite(preco) || preco < 0 || preco > 100000) {
        alert("Preço inválido.");
        return;
    }

    const categoriaNumero = prompt(
        "Número da categoria:\n" +
        categorias.map((c, i) => `${i + 1} - ${c.nome}`).join("\n"),
        String(categorias.findIndex(c => c.id === produto.categoria_id) + 1)
    );

    const categoria = categorias[Number(categoriaNumero) - 1];

    if (!categoria) {
        alert("Categoria inválida.");
        return;
    }

    const { error } = await supabase
        .from("produtos")
        .update({
            nome: nome.trim(),
            descricao: (descricao || "").trim(),
            preco_centavos: Math.round(preco * 100),
            categoria_id: categoria.id
        })
        .eq("id", produto.id)
        .eq("restaurante_id", restauranteId);

    if (error) {
        alert("Erro ao editar produto: " + error.message);
        return;
    }

    await carregarCardapio();
}

async function alterarDisponibilidade(produto) {
    const { error } = await supabase
        .from("produtos")
        .update({ disponivel: !produto.disponivel })
        .eq("id", produto.id)
        .eq("restaurante_id", restauranteId);

    if (error) {
        alert("Não foi possível alterar a disponibilidade.");
        console.error(error);
        return;
    }

    await carregarCardapio();
}

async function arquivarProduto(produto) {
    if (!confirm("Arquivar " + produto.nome + "?")) return;

    const { error } = await supabase
        .from("produtos")
        .update({ arquivado: true })
        .eq("id", produto.id)
        .eq("restaurante_id", restauranteId);

    if (error) {
        alert("Não foi possível arquivar o produto.");
        console.error(error);
        return;
    }

    await carregarCardapio();
}

// --------------------------------------------------
// MESAS
// --------------------------------------------------

async function carregarMesas() {
    const container = $("lista-mesas");
    if (!container || !restauranteId) return;

    mensagem(container, "A carregar mesas...");

    const { data, error } = await supabase
        .from("mesas")
        .select("id,nome,ativa,aberta_ate,criado_em")
        .eq("restaurante_id", restauranteId)
        .order("nome");

    if (error) {
        mensagem(container, "Não foi possível carregar as mesas.");
        console.error(error);
        return;
    }

    container.replaceChildren();

    if (temPapel("dono", "gerente")) {
        container.appendChild(botao("Adicionar mesa", "botao-secundario", criarMesa));
    }

    if (!data?.length) {
        container.appendChild(elemento("p", "mensagem", "Ainda não existem mesas."));
        return;
    }

    data.forEach(mesa => {
        const cartao = elemento("article", "mesa");

        cartao.appendChild(elemento("h3", "", mesa.nome));
        cartao.appendChild(elemento("p", "", mesa.ativa ? "Mesa ativa" : "Mesa desativada"));

        cartao.appendChild(elemento("p", "", mesa.aberta_ate
            ? "Aberta até: " + formatarData(mesa.aberta_ate)
            : "Não está aberta"));

        if (temPapel("empregado", "caixa", "gerente", "dono")) {
            if (mesa.ativa) {
                cartao.appendChild(botao(
                    "Abrir mesa por 3 horas",
                    "botao-sucesso",
                    () => executarFuncaoMesa("ativar_mesa", {
                        p_mesa_id: mesa.id,
                        p_horas: 3
                    })
                ));

                cartao.appendChild(botao(
                    "Encerrar mesa",
                    "botao-secundario",
                    () => executarFuncaoMesa("encerrar_mesa", {
                        p_mesa_id: mesa.id
                    })
                ));
            }
        }

        if (temPapel("dono", "gerente")) {
            cartao.appendChild(botao(
                "Gerar novo QR",
                "botao-secundario",
                () => regenerarQR(mesa)
            ));

            cartao.appendChild(botao(
                mesa.ativa ? "Desativar mesa" : "Ativar mesa",
                "botao-perigo",
                () => alterarMesa(mesa)
            ));
        }

        container.appendChild(cartao);
    });
}

async function criarMesa() {
    const nome = prompt("Nome da mesa:");
    if (!nome?.trim()) return;

    const { error } = await supabase.from("mesas").insert({
        restaurante_id: restauranteId,
        nome: nome.trim(),
        ativa: true
    });

    if (error) {
        alert("Erro ao criar mesa: " + error.message);
        return;
    }

    await carregarMesas();
}

async function executarFuncaoMesa(funcao, argumentos) {
    const { error } = await supabase.rpc(funcao, argumentos);

    if (error) {
        alert("Não foi possível executar a operação: " + error.message);
        console.error(error);
        return;
    }

    await carregarMesas();
}

async function regenerarQR(mesa) {
    if (!confirm("O QR antigo da " + mesa.nome + " deixará de funcionar. Continuar?")) {
        return;
    }

    const { data, error } = await supabase.rpc("regenerar_qr_mesa", {
        p_mesa_id: mesa.id
    });

    if (error) {
        alert("Não foi possível gerar o QR: " + error.message);
        console.error(error);
        return;
    }

    const endereco = new URL("index.html", window.location.href);
    endereco.searchParams.set("mesa", data);

    prompt("Novo endereço para o QR da " + mesa.nome + ":", endereco.href);

    await carregarMesas();
}

async function alterarMesa(mesa) {
    const { error } = await supabase
        .from("mesas")
        .update({ ativa: !mesa.ativa })
        .eq("id", mesa.id)
        .eq("restaurante_id", restauranteId);

    if (error) {
        alert("Não foi possível alterar a mesa: " + error.message);
        console.error(error);
        return;
    }

    await carregarMesas();
}

// --------------------------------------------------
// EQUIPA
// --------------------------------------------------

async function carregarEquipa() {
    const container = $("lista-equipa");
    if (!container || !temPapel("dono")) return;

    mensagem(container, "A carregar equipa...");

    const { data, error } = await supabase
        .from("membros_equipa")
        .select("id,nome,papel,ativo,criado_em")
        .eq("restaurante_id", restauranteId)
        .order("nome");

    if (error) {
        mensagem(container, "Não foi possível carregar a equipa.");
        console.error(error);
        return;
    }

    container.replaceChildren();

    (data || []).forEach(membro => {
        const cartao = elemento("article", "membro");

        cartao.appendChild(elemento("h3", "", membro.nome));
        cartao.appendChild(elemento("p", "", papeis[membro.papel] || membro.papel));
        cartao.appendChild(elemento("p", "", membro.ativo ? "Ativo" : "Desativado"));

        cartao.appendChild(botao(
            "Editar funcionário",
            "botao-secundario",
            () => editarMembro(membro)
        ));

        container.appendChild(cartao);
    });

    container.appendChild(elemento(
        "p",
        "mensagem",
        "A criação de novas contas será disponibilizada através de um processo seguro de convite."
    ));
}

async function editarMembro(membro) {
    const nome = prompt("Nome:", membro.nome);
    if (!nome?.trim()) return;

    const papeisDisponiveis = ["dono", "gerente", "caixa", "cozinha", "empregado"];

    const papel = prompt(
        "Cargo:\n1 - dono\n2 - gerente\n3 - caixa\n4 - cozinha\n5 - empregado",
        String(papeisDisponiveis.indexOf(membro.papel) + 1)
    );

    const novoPapel = papeisDisponiveis[Number(papel) - 1];

    if (!novoPapel) {
        alert("Cargo inválido.");
        return;
    }

    const ativo = confirm("Manter este funcionário ativo?");

    const { error } = await supabase
        .from("membros_equipa")
        .update({
            nome: nome.trim(),
            papel: novoPapel,
            ativo
        })
        .eq("id", membro.id)
        .eq("restaurante_id", restauranteId);

    if (error) {
        alert("Não foi possível atualizar o funcionário: " + error.message);
        console.error(error);
        return;
    }

    await carregarEquipa();
}

// --------------------------------------------------
// HISTÓRICO
// --------------------------------------------------

async function carregarHistorico() {
    const container = $("lista-historico");
    if (!container || !temPapel("dono", "gerente")) return;

    mensagem(container, "A carregar histórico...");

    const { data, error } = await supabase
        .from("historico_estados")
        .select("pedido_id,tipo,de_estado,para_estado,usuario_nome,motivo,criado_em")
        .eq("restaurante_id", restauranteId)
        .order("criado_em", { ascending: false })
        .limit(100);

    if (error) {
        mensagem(container, "Não foi possível carregar o histórico.");
        console.error(error);
        return;
    }

    container.replaceChildren();

    if (!data?.length) {
        mensagem(container, "Ainda não existem registos.");
        return;
    }

    data.forEach(registo => {
        const cartao = elemento("article", "registo");

        cartao.appendChild(elemento("p", "", "Tipo: " + registo.tipo));
        cartao.appendChild(elemento("p", "", "De: " + (registo.de_estado || "—")));
        cartao.appendChild(elemento("p", "", "Para: " + registo.para_estado));
        cartao.appendChild(elemento("p", "", "Responsável: " + (registo.usuario_nome || "Cliente")));
        cartao.appendChild(elemento("p", "", "Data: " + formatarData(registo.criado_em)));

        if (registo.motivo) {
            cartao.appendChild(elemento("p", "", "Motivo: " + registo.motivo));
        }

        container.appendChild(cartao);
    });
}

// --------------------------------------------------
// TEMPO REAL
// --------------------------------------------------

function iniciarTempoReal() {
    if (canalPedidos) {
        supabase.removeChannel(canalPedidos);
    }

    canalPedidos = supabase
        .channel("pedidos-" + restauranteId)
        .on(
            "postgres_changes",
            {
                event: "*",
                schema: "public",
                table: "pedidos",
                filter: "restaurante_id=eq." + restauranteId
            },
            async () => {
                await carregarPedidos();
            }
        )
        .subscribe();
}

// --------------------------------------------------
// FILTROS E ATUALIZAÇÃO
// --------------------------------------------------

$("filtro-estado")?.addEventListener("change", () => {
    mostrarPedidos(pedidosAtuais);
});

$("btn-atualizar-pedidos")?.addEventListener("click", carregarPedidos);

// --------------------------------------------------
// SAIR E SESSÃO
// --------------------------------------------------

botaoSair.addEventListener("click", async () => {
    if (canalPedidos) {
        await supabase.removeChannel(canalPedidos);
        canalPedidos = null;
    }

    await supabase.auth.signOut();

    restauranteId = null;
    utilizadorAtual = null;
    membroAtual = null;
    pedidosAtuais = [];

    mostrarLogin();
    mostrarMensagem("Sessão terminada.");
});

async function iniciar() {
    const { data, error } = await supabase.auth.getSession();

    if (error) {
        mostrarLogin();
        mostrarMensagem("Não foi possível verificar a sessão.");
        return;
    }

    if (data.session) {
        await iniciarPainel(data.session.user);
    } else {
        mostrarLogin();
    }
}

iniciar();
