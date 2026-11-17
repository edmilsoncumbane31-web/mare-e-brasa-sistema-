import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

const SUPABASE_URL = "https://fqmwhuxtnmkigqzxvvdr.supabase.co";
const SUPABASE_KEY = "sb_publishable_Y9G1dFENVRTQCpJXgoo8BQ_D6KUlhJY";

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const loginEl = document.getElementById("login");
const dashboardEl = document.getElementById("dashboard");
const formLogin = document.getElementById("form-login");
const mensagemLogin = document.getElementById("mensagem-login");
const botaoSair = document.getElementById("btn-sair");
const listaPedidos = document.getElementById("lista-pedidos");

let restauranteId = null;
let utilizadorAtual = null;

const estados = {
    novo: "Novo",
    confirmado: "Confirmado",
    em_preparacao: "Em preparação",
    pronto: "Pronto",
    entregue: "Entregue",
    cancelado: "Cancelado"
};

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

function mostrarMensagem(mensagem) {
    mensagemLogin.textContent = mensagem;
}

function formatarDinheiro(centavos) {
    return (Number(centavos || 0) / 100).toLocaleString("pt-MZ", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    }) + " MT";
}

// Autenticação
formLogin.addEventListener("submit", async (evento) => {
    evento.preventDefault();

    mostrarMensagem("A verificar acesso...");

    const email = document.getElementById("email").value.trim();
    const senha = document.getElementById("senha").value;

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

// Verificar se o utilizador pertence à equipa
async function iniciarPainel(utilizador) {
    utilizadorAtual = utilizador;

    const { data: membro, error } = await supabase
        .from("membros_equipa")
        .select("id, restaurante_id, nome, papel")
        .eq("user_id", utilizador.id)
        .eq("ativo", true)
        .maybeSingle();

    if (error || !membro) {
        mostrarLogin();
        mostrarMensagem("Esta conta não tem acesso autorizado ao restaurante.");
        await supabase.auth.signOut();
        console.error(error);
        return;
    }

    restauranteId = membro.restaurante_id;

    document.getElementById("boas-vindas").textContent =
        "Bem-vindo, " + membro.nome + " · " + membro.papel;

    mostrarDashboard();

    await carregarPedidos();
}

// Carregar pedidos
async function carregarPedidos() {
    listaPedidos.textContent = "A carregar pedidos...";

    const { data, error } = await supabase
        .from("pedidos")
        .select(`
            id,
            numero,
            estado,
            estado_pagamento,
            total_centavos,
            nome_cliente,
            criado_em,
            mesa_id
        `)
        .eq("restaurante_id", restauranteId)
        .order("criado_em", { ascending: false })
        .limit(30);

    if (error) {
        listaPedidos.textContent = "Não foi possível carregar os pedidos.";
        console.error(error);
        return;
    }

    atualizarResumo(data || []);
    mostrarPedidos(data || []);
}

// Atualizar indicadores
function atualizarResumo(pedidos) {
    const novos = pedidos.filter(p => p.estado === "novo").length;

    const preparacao = pedidos.filter(
        p => p.estado === "em_preparacao"
    ).length;

    const prontos = pedidos.filter(
        p => p.estado === "pronto"
    ).length;

    document.getElementById("pedidos-novos").textContent = novos;
    document.getElementById("pedidos-preparacao").textContent = preparacao;
    document.getElementById("pedidos-prontos").textContent = prontos;
}

// Mostrar pedidos
function mostrarPedidos(pedidos) {
    listaPedidos.replaceChildren();

    if (pedidos.length === 0) {
        listaPedidos.textContent = "Ainda não existem pedidos.";
        return;
    }

    pedidos.forEach(pedido => {
        const cartao = document.createElement("article");
        cartao.className = "cartao-pedido";

        const titulo = document.createElement("h3");
        titulo.textContent = "Pedido #" + pedido.numero;

        const cliente = document.createElement("p");
        cliente.textContent = "Cliente: " + (pedido.nome_cliente || "Não identificado");

        const estado = document.createElement("p");
        estado.textContent = "Estado: " + (estados[pedido.estado] || pedido.estado);

        const pagamento = document.createElement("p");
        pagamento.textContent = "Pagamento: " + pedido.estado_pagamento;

        const total = document.createElement("p");
        total.textContent = "Total: " + formatarDinheiro(pedido.total_centavos);

        const data = document.createElement("p");
        data.textContent = "Data: " + new Date(pedido.criado_em).toLocaleString("pt-MZ");

        cartao.append(titulo, cliente, estado, pagamento, total, data);

        const proximoEstado = {
            novo: "confirmado",
            confirmado: "em_preparacao",
            em_preparacao: "pronto",
            pronto: "entregue"
        }[pedido.estado];

        if (proximoEstado) {
            const botao = document.createElement("button");

            botao.textContent = "Avançar para: " + estados[proximoEstado];

            botao.addEventListener("click", () => {
                mudarEstado(pedido.id, proximoEstado, botao);
            });

            cartao.appendChild(botao);
        }

        listaPedidos.appendChild(cartao);
    });
}

// Alterar estado através da função segura do Supabase
async function mudarEstado(pedidoId, novoEstado, botao) {
    botao.disabled = true;
    botao.textContent = "A atualizar...";

    const { error } = await supabase.rpc("mudar_estado_pedido", {
        p_pedido_id: pedidoId,
        p_novo: novoEstado,
        p_motivo: null
    });

    if (error) {
        alert("Não foi possível atualizar o pedido: " + error.message);
        console.error(error);
        botao.disabled = false;
        botao.textContent = "Tentar novamente";
        return;
    }

    await carregarPedidos();
}

// Terminar sessão
botaoSair.addEventListener("click", async () => {
    await supabase.auth.signOut();

    restauranteId = null;
    utilizadorAtual = null;

    mostrarLogin();
    mostrarMensagem("Sessão terminada.");
});

// Verificar sessão existente
async function iniciar() {
    const { data } = await supabase.auth.getSession();

    if (data.session) {
        await iniciarPainel(data.session.user);
    } else {
        mostrarLogin();
    }
}

iniciar();
