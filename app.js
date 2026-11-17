
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

// =====================================================
// 1. CONFIGURAÇÃO
// =====================================================

const SUPABASE_URL = "https://fqmwhuxtnmkigqzxvvdr.supabase.co";
const SUPABASE_KEY = "sb_publishable_Y9G1dFENVRTQCpJXgoo8BQ_D6KUlhJY";

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const RESTAURANTE_SLUG = "mare-e-brasa";

let restaurante = null;
let mesa = null;
let categorias = [];
let produtos = [];
let carrinho = [];
let pedidoAtual = null;
let filtroCategoria = "todos";
let temporizadorAcompanhamento = null;

const parametrosURL = new URLSearchParams(window.location.search);
const tokenMesa = parametrosURL.get("mesa");

const elementoRestaurante = document.getElementById("restaurante");
const elementoCategorias = document.getElementById("categorias");
const elementoProdutos = document.getElementById("produtos");

const STORAGE_PEDIDO = "mare_brasa_pedido_acompanhamento";
const STORAGE_PENDENTE = "mare_brasa_pedido_pendente";

// =====================================================
// 2. FUNÇÕES AUXILIARES
// =====================================================

function criarElemento(tag, classe, texto) {
    const elemento = document.createElement(tag);

    if (classe) elemento.className = classe;
    if (texto !== undefined && texto !== null) {
        elemento.textContent = texto;
    }

    return elemento;
}

function mostrarMensagem(container, texto, classe = "mensagem") {
    container.replaceChildren();
    container.appendChild(criarElemento("p", classe, texto));
}

function formatarPreco(centavos) {
    return new Intl.NumberFormat("pt-MZ", {
        style: "currency",
        currency: "MZN"
    }).format(Number(centavos) / 100);
}

function gerarSegredo() {
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);

    return Array.from(bytes)
        .map(byte => byte.toString(16).padStart(2, "0"))
        .join("");
}

function obterImagem(fotoPath) {
    if (!fotoPath) return null;

    const { data } = supabase.storage
        .from("fotos-pratos")
        .getPublicUrl(fotoPath);

    return data?.publicUrl || null;
}

function mostrarErro(erro) {
    const mensagens = {
        MESA_INVALIDA: "Esta mesa não é válida.",
        MESA_FECHADA: "Esta mesa ainda não foi aberta pela equipa.",
        PEDIDOS_FECHADOS: "O restaurante não está a aceitar pedidos.",
        CARRINHO_INVALIDO: "Verifica os produtos e as quantidades.",
        PRODUTO_INDISPONIVEL: "Um dos produtos já não está disponível.",
        AGUARDE: "Aguarda alguns segundos antes de enviar outro pedido.",
        MUITOS_PEDIDOS: "Esta mesa atingiu o limite de pedidos.",
        SISTEMA_OCUPADO: "O restaurante está com muitos pedidos. Tenta novamente.",
        SEGREDO_INVALIDO: "Código de acompanhamento inválido.",
        SEGREDO_EM_USO: "Não foi possível reutilizar este código.",
        SEGREDO_REUTILIZADO_COM_CONTEUDO_DIFERENTE:
            "O pedido foi alterado. Confirma o carrinho e tenta novamente."
    };

    const mensagem = mensagens[erro?.message] ||
        "Ocorreu um erro. Verifica a ligação à internet e tenta novamente.";

    alert(mensagem);
}

// =====================================================
// 3. IDENTIFICAÇÃO DO RESTAURANTE E DA MESA
// =====================================================

async function carregarRestaurante() {
    const { data, error } = await supabase
        .from("restaurantes")
        .select("id,nome,endereco,slug,ativo,aceita_pedidos")
        .eq("slug", RESTAURANTE_SLUG)
        .eq("ativo", true)
        .maybeSingle();

    if (error) throw error;
    if (!data) throw new Error("RESTAURANTE_NAO_ENCONTRADO");

    restaurante = data;

    const titulo = criarElemento("h2", "", restaurante.nome);
    const endereco = criarElemento("p", "", restaurante.endereco || "");

    elementoRestaurante.replaceChildren(titulo, endereco);

    if (!restaurante.aceita_pedidos) {
        elementoRestaurante.appendChild(
            criarElemento("p", "aviso", "Neste momento não estamos a aceitar pedidos.")
        );
    }
}

async function carregarMesa() {
    if (!tokenMesa) {
        mostrarMensagem(
            elementoRestaurante,
            "Acede ao cardápio através do QR Code de uma mesa.",
            "aviso"
        );
        return false;
    }

    const { data, error } = await supabase.rpc("abrir_mesa", {
        p_token: tokenMesa
    });

    if (error) throw error;

    if (!data) {
        mostrarMensagem(
            elementoRestaurante,
            "Mesa inválida ou desativada. Solicita ajuda à equipa.",
            "aviso"
        );
        return false;
    }

    mesa = data;

    const titulo = criarElemento("h2", "", restaurante.nome);
    const nomeMesa = criarElemento("p", "identificacao-mesa", `Mesa: ${mesa.mesa}`);

    elementoRestaurante.replaceChildren(titulo, nomeMesa);

    if (!mesa.aceita_pedidos) {
        elementoRestaurante.appendChild(
            criarElemento("p", "aviso", "O restaurante não está a aceitar pedidos.")
        );
        return false;
    }

    if (mesa.exige_mesa_aberta && !mesa.mesa_aberta) {
        elementoRestaurante.appendChild(
            criarElemento("p", "aviso", "A mesa ainda não foi aberta pela equipa.")
        );
        return false;
    }

    return true;
}

// =====================================================
// 4. CARREGAR CARDÁPIO
// =====================================================

async function carregarCategorias() {
    const { data, error } = await supabase
        .from("categorias")
        .select("id,nome,ordem")
        .eq("restaurante_id", restaurante.id)
        .eq("visivel", true)
        .order("ordem");

    if (error) throw error;

    categorias = data || [];
}

async function carregarProdutos() {
    const { data, error } = await supabase
        .from("produtos")
        .select(`
            id,
            categoria_id,
            nome,
            descricao,
            preco_centavos,
            foto_path,
            disponivel,
            destaque,
            ordem
        `)
        .eq("restaurante_id", restaurante.id)
        .eq("disponivel", true)
        .eq("arquivado", false)
        .order("ordem");

    if (error) throw error;

    produtos = data || [];
}

function desenharCategorias() {
    elementoCategorias.replaceChildren();

    const botaoTodos = criarElemento("button", "categoria-btn", "Todos");
    botaoTodos.type = "button";
    botaoTodos.addEventListener("click", () => {
        filtroCategoria = "todos";
        desenharCategorias();
        desenharProdutos();
    });

    if (filtroCategoria === "todos") {
        botaoTodos.classList.add("ativo");
    }

    elementoCategorias.appendChild(botaoTodos);

    categorias.forEach(categoria => {
        const botaoCategoria = criarElemento(
            "button",
            "categoria-btn",
            categoria.nome
        );

        botaoCategoria.type = "button";

        if (filtroCategoria === categoria.id) {
            botaoCategoria.classList.add("ativo");
        }

        botaoCategoria.addEventListener("click", () => {
            filtroCategoria = categoria.id;
            desenharCategorias();
            desenharProdutos();
        });

        elementoCategorias.appendChild(botaoCategoria);
    });
}

function desenharProdutos() {
    elementoProdutos.replaceChildren();

    const lista = filtroCategoria === "todos"
        ? produtos
        : produtos.filter(p => p.categoria_id === filtroCategoria);

    if (lista.length === 0) {
        mostrarMensagem(elementoProdutos, "Não existem pratos nesta categoria.");
        return;
    }

    lista.forEach(produto => {
        const cartao = criarElemento("article", "produto");

        if (produto.destaque) {
            cartao.appendChild(
                criarElemento("span", "produto-destaque", "Destaque")
            );
        }

        const imagemURL = obterImagem(produto.foto_path);

        if (imagemURL) {
            const imagem = document.createElement("img");
            imagem.src = imagemURL;
            imagem.alt = produto.nome;
            imagem.loading = "lazy";
            cartao.appendChild(imagem);
        }

        cartao.appendChild(
            criarElemento("h3", "produto-nome", produto.nome)
        );

        if (produto.descricao) {
            cartao.appendChild(
                criarElemento("p", "produto-descricao", produto.descricao)
            );
        }

        cartao.appendChild(
            criarElemento("p", "produto-preco", formatarPreco(produto.preco_centavos))
        );

        const botaoAdicionar = criarElemento("button", "botao-adicionar", "Adicionar");
        botaoAdicionar.type = "button";
        botaoAdicionar.disabled = !mesa || !restaurante.aceita_pedidos;

        botaoAdicionar.addEventListener("click", () => {
            adicionarAoCarrinho(produto.id);
        });

        cartao.appendChild(botaoAdicionar);
        elementoProdutos.appendChild(cartao);
    });
}

// =====================================================
// 5. CARRINHO
// =====================================================

const secaoCarrinho = criarElemento("section", "secao-carrinho");
secaoCarrinho.id = "carrinho";

const tituloCarrinho = criarElemento("h2", "", "O teu pedido");
const listaCarrinho = criarElemento("div", "lista-carrinho");
const totalCarrinho = criarElemento("p", "total-carrinho", "Total: 0 MT");
const botaoFinalizar = criarElemento("button", "botao-finalizar", "Enviar pedido");

botaoFinalizar.type = "button";
botaoFinalizar.addEventListener("click", finalizarPedido);

secaoCarrinho.append(
    tituloCarrinho,
    listaCarrinho,
    totalCarrinho,
    botaoFinalizar
);

elementoProdutos.insertAdjacentElement("afterend", secaoCarrinho);

function adicionarAoCarrinho(produtoId) {
    const produto = produtos.find(p => p.id === produtoId);
    if (!produto) return;

    const existente = carrinho.find(item => item.produto_id === produtoId);

    if (existente) {
        if (existente.quantidade >= 20) {
            alert("O limite é de 20 unidades por produto.");
            return;
        }

        existente.quantidade++;
    } else {
        carrinho.push({
            produto_id: produto.id,
            nome: produto.nome,
            preco_centavos: produto.preco_centavos,
            quantidade: 1,
            nota: ""
        });
    }

    desenharCarrinho();
}

function desenharCarrinho() {
    listaCarrinho.replaceChildren();

    let total = 0;

    carrinho.forEach(item => {
        const linha = criarElemento("div", "item-carrinho");

        linha.appendChild(
            criarElemento("h3", "", item.nome)
        );

        linha.appendChild(
            criarElemento("p", "", formatarPreco(item.preco_centavos))
        );

        const quantidade = criarElemento("div", "quantidade-carrinho");

        const diminuir = criarElemento("button", "", "−");
        diminuir.type = "button";
        diminuir.addEventListener("click", () => alterarQuantidade(item.produto_id, -1));

        const numero = criarElemento("span", "", String(item.quantidade));

        const aumentar = criarElemento("button", "", "+");
        aumentar.type = "button";
        aumentar.addEventListener("click", () => alterarQuantidade(item.produto_id, 1));

        quantidade.append(diminuir, numero, aumentar);

        const nota = document.createElement("input");
        nota.type = "text";
        nota.maxLength = 150;
        nota.placeholder = "Observação deste prato (opcional)";
        nota.value = item.nota;

        nota.addEventListener("input", () => {
            item.nota = nota.value;
        });

        const remover = criarElemento("button", "botao-remover", "Remover");
        remover.type = "button";
        remover.addEventListener("click", () => removerDoCarrinho(item.produto_id));

        linha.append(
            quantidade,
            nota,
            remover
        );

        listaCarrinho.appendChild(linha);

        total += item.preco_centavos * item.quantidade;
    });

    totalCarrinho.textContent = `Total: ${formatarPreco(total)}`;

    botaoFinalizar.disabled = carrinho.length === 0 || !mesa;
}

function alterarQuantidade(produtoId, diferenca) {
    const item = carrinho.find(p => p.produto_id === produtoId);
    if (!item) return;

    item.quantidade += diferenca;

    if (item.quantidade <= 0) {
        removerDoCarrinho(produtoId);
        return;
    }

    if (item.quantidade > 20) {
        item.quantidade = 20;
    }

    desenharCarrinho();
}

function removerDoCarrinho(produtoId) {
    carrinho = carrinho.filter(item => item.produto_id !== produtoId);
    desenharCarrinho();
}

// =====================================================
// 6. ENVIAR PEDIDO
// =====================================================

function obterItensParaEnviar() {
    return carrinho.map(item => ({
        produto_id: item.produto_id,
        quantidade: item.quantidade,
        nota: item.nota.trim()
    }));
}

function obterSegredoPendente(itens) {
    const assinatura = JSON.stringify(itens);

    try {
        const anterior = JSON.parse(
            localStorage.getItem(STORAGE_PENDENTE) || "null"
        );

        if (
            anterior &&
            anterior.token === tokenMesa &&
            anterior.assinatura === assinatura
        ) {
            return anterior.segredo;
        }
    } catch {
        // Se os dados locais estiverem inválidos, cria um novo código.
    }

    const segredo = gerarSegredo();

    localStorage.setItem(
        STORAGE_PENDENTE,
        JSON.stringify({
            token: tokenMesa,
            assinatura,
            segredo
        })
    );

    return segredo;
}

async function finalizarPedido() {
    if (!mesa || carrinho.length === 0) {
        alert("Adiciona pelo menos um produto ao carrinho.");
        return;
    }

    const nome = prompt("Nome (opcional):");
    if (nome === null) return;

    const notaGeral = prompt("Observações gerais do pedido (opcional):");
    if (notaGeral === null) return;

    const itens = obterItensParaEnviar();
    const segredo = obterSegredoPendente(itens);

    botaoFinalizar.disabled = true;
    botaoFinalizar.textContent = "A enviar...";

    try {
        const { data, error } = await supabase.rpc("criar_pedido", {
            p_token: tokenMesa,
            p_itens: itens,
            p_nome: nome.trim() || null,
            p_nota: notaGeral.trim() || null,
            p_segredo: segredo
        });

        if (error) throw error;
        if (!data || !data.pedido_id) {
            throw new Error("RESPOSTA_INVALIDA");
        }

        pedidoAtual = {
            segredo: data.segredo,
            numero: data.numero
        };

        localStorage.setItem(
            STORAGE_PEDIDO,
            JSON.stringify({
                segredo: data.segredo,
                numero: data.numero
            })
        );

        localStorage.removeItem(STORAGE_PENDENTE);

        carrinho = [];
        desenharCarrinho();

        mostrarAcompanhamentoInicial(data);

    } catch (erro) {
        console.error("Erro ao enviar pedido:", erro);
        mostrarErro(erro);
    } finally {
        botaoFinalizar.disabled = carrinho.length === 0;
        botaoFinalizar.textContent = "Enviar pedido";
    }
}

// =====================================================
// 7. ACOMPANHAMENTO DO PEDIDO
// =====================================================

const secaoAcompanhamento = criarElemento("section", "secao-acompanhamento");
secaoAcompanhamento.id = "acompanhamento";

secaoCarrinho.insertAdjacentElement("afterend", secaoAcompanhamento);

function mostrarAcompanhamentoInicial(data) {
    secaoAcompanhamento.replaceChildren();

    secaoAcompanhamento.appendChild(
        criarElemento("h2", "", `Pedido #${data.numero} enviado!`)
    );

    secaoAcompanhamento.appendChild(
        criarElemento("p", "", "Guarda o código abaixo para acompanhares o pedido.")
    );

    const codigo = criarElemento("p", "codigo-secreto", data.segredo);

    secaoAcompanhamento.appendChild(codigo);

    const botaoCopiar = criarElemento("button", "", "Copiar código");
    botaoCopiar.type = "button";

    botaoCopiar.addEventListener("click", async () => {
        try {
            await navigator.clipboard.writeText(data.segredo);
            alert("Código copiado.");
        } catch {
            alert("Copia manualmente o código apresentado.");
        }
    });

    secaoAcompanhamento.appendChild(botaoCopiar);

    secaoAcompanhamento.appendChild(
        criarElemento("p", "", `Total: ${formatarPreco(data.total_centavos)}`)
    );

    consultarAcompanhamento(data.segredo);
}

async function consultarAcompanhamento(segredo) {
    if (temporizadorAcompanhamento) {
        clearInterval(temporizadorAcompanhamento);
    }

    await atualizarAcompanhamento(segredo);

    temporizadorAcompanhamento = setInterval(() => {
        atualizarAcompanhamento(segredo);
    }, 8000);
}

async function atualizarAcompanhamento(segredo) {
    const { data, error } = await supabase.rpc("acompanhar_pedido", {
        p_segredo: segredo
    });

    if (error) {
        console.error("Erro no acompanhamento:", error);
        return;
    }

    if (!data) {
        if (temporizadorAcompanhamento) {
            clearInterval(temporizadorAcompanhamento);
            temporizadorAcompanhamento = null;
        }

        secaoAcompanhamento.appendChild(
            criarElemento("p", "aviso", "Este código expirou ou não corresponde a um pedido.")
        );
        return;
    }

    desenharEstadoPedido(data);
}

function desenharEstadoPedido(pedido) {
    secaoAcompanhamento.replaceChildren();

    secaoAcompanhamento.appendChild(
        criarElemento("h2", "", `Acompanhamento do pedido #${pedido.numero}`)
    );

    secaoAcompanhamento.appendChild(
        criarElemento("p", "", `Mesa: ${pedido.mesa}`)
    );

    const estados = {
        novo: "Pedido recebido",
        confirmado: "Pedido confirmado",
        em_preparacao: "Em preparação",
        pronto: "Pronto para ser servido",
        entregue: "Pedido entregue",
        cancelado: "Pedido cancelado"
    };

    secaoAcompanhamento.appendChild(
        criarElemento("p", "estado-pedido", estados[pedido.estado] || pedido.estado)
    );

    secaoAcompanhamento.appendChild(
        criarElemento(
            "p",
            "",
            pedido.estado_pagamento === "pago"
                ? "Pagamento confirmado"
                : "Pagamento pendente — pagamento presencial"
        )
    );

    secaoAcompanhamento.appendChild(
        criarElemento("h3", "", "Resumo do pedido")
    );

    const lista = criarElemento("div", "resumo-itens");

    (pedido.itens || []).forEach(item => {
        const linha = criarElemento(
            "p",
            "",
            `${item.quantidade} × ${item.nome} — ${formatarPreco(item.preco_unit_centavos * item.quantidade)}`
        );

        lista.appendChild(linha);
    });

    secaoAcompanhamento.appendChild(lista);

    secaoAcompanhamento.appendChild(
        criarElemento("p", "total-pedido", `Total: ${formatarPreco(pedido.total_centavos)}`)
    );

    if (pedido.estado === "entregue" || pedido.estado === "cancelado") {
        if (temporizadorAcompanhamento) {
            clearInterval(temporizadorAcompanhamento);
            temporizadorAcompanhamento = null;
        }
    }
}

// =====================================================
// 8. RECUPERAR ACOMPANHAMENTO ANTERIOR
// =====================================================

function recuperarPedidoAnterior() {
    try {
        const guardado = JSON.parse(
            localStorage.getItem(STORAGE_PEDIDO) || "null"
        );

        if (guardado && guardado.segredo) {
            pedidoAtual = guardado;
            consultarAcompanhamento(guardado.segredo);
        }
    } catch {
        localStorage.removeItem(STORAGE_PEDIDO);
    }
}

// =====================================================
// 9. INICIALIZAÇÃO
// =====================================================

async function iniciar() {
    try {
        if (!elementoRestaurante || !elementoCategorias || !elementoProdutos) {
            throw new Error("ELEMENTOS_HTML_NAO_ENCONTRADOS");
        }

        mostrarMensagem(elementoRestaurante, "A carregar restaurante...");

        await carregarRestaurante();

        const mesaValida = await carregarMesa();

        await carregarCategorias();
        await carregarProdutos();

        desenharCategorias();
        desenharProdutos();
        desenharCarrinho();

        if (!mesaValida) {
            botaoFinalizar.disabled = true;
        }

        recuperarPedidoAnterior();

    } catch (erro) {
        console.error("Erro ao iniciar o cardápio:", erro);

        mostrarMensagem(
            elementoRestaurante,
            "Não foi possível carregar o cardápio. Atualiza a página ou tenta novamente."
        );
    }
}

iniciar();
