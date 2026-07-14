<div align="center">

# 🌍 Homelab Weather Map

**Dashboard interativo para monitoramento do clima global em tempo real, combinando dados de múltiplas APIs.**

[![Node.js](https://img.shields.io/badge/Node.js-18+-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![Express](https://img.shields.io/badge/Express-4.x-000000?logo=express)](https://expressjs.com/)
[![Leaflet](https://img.shields.io/badge/Leaflet-1.9-199900?logo=leaflet)](https://leafletjs.com/)
[![License](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

</div>

---

## 📸 Preview

O painel apresenta um mapa interativo global com:
- **Países coloridos por temperatura** usando escala de cores dinâmica
- **Marcadores de cidades** com temperatura, condição climática e ícones animados
- **Setas de vento** com rotação e opacidade baseadas na velocidade real
- **Animação de chuva** com partículas em tempo real na tela
- **Painel lateral** com detalhes meteorológicos e gráfico de histórico das últimas 24 horas
- **Ticker informativo** com estatísticas globais passando na tela em tempo real

---

## 🚀 Funcionalidades

### Mapa Interativo
- **363 cidades** monitoradas ao redor do mundo
- Mapa base CartoDB Dark (tema escuro) com zoom e movimentação fluida
- Países coloridos por temperatura (interpolação baseada na estação mais próxima)
- Legenda de temperatura com escala de -20°C a 40°C+
- Busca por coordenadas (latitude/longitude) ou detecção automática de localização
- Atalho para modo tela cheia (tecla `F`)

### Camadas do Mapa
| Camada | Descrição |
|--------|-----------|
| Temperatura | Preenchimento colorido dos países + labels de temperatura |
| Vento | Setas animadas que mostram a direção e intensidade |
| Chuva | Pontos de precipitação + animação de partículas na tela |
| Cidades | Marcadores com nome, temperatura atual e condição |

### Consenso de Dados (Múltiplas APIs)
Para garantir dados mais precisos e evitar falhas se um serviço cair, o sistema combina dados de **3 APIs** diferentes de forma inteligente:

| API | Peso no Cálculo | Cobertura |
|-----|-----------------|-----------|
| [Open-Meteo](https://open-meteo.com/) | 1.0 | Global |
| [MET Norway](https://www.met.no/) | 0.8 | Global |
| [wttr.in](https://wttr.in/) | 0.9 | Global |

- **Filtro de erros (outliers)**: O sistema ignora automaticamente qualquer leitura que desvie mais de 4°C da média geral das outras APIs.
- **Média ponderada**: Combina as respostas válidas aplicando o peso de cada API.
- **Direção do vento**: Vetor médio calculado de forma trigonométrica.
- **Condição climática**: Sistema de votação de maioria simples entre as APIs.

### Painel de Detalhes
- Dados de temperatura, vento, direção, pressão, umidade e precipitação.
- Condições climáticas com ícones no formato SVG.
- Tendências (subindo/caindo/estável) comparando a leitura atual com a anterior.
- Gráfico de histórico das últimas 24 horas gerado com Chart.js.

### Atualizações em Tempo Real
- Uso de **SSE (Server-Sent Events)** para atualizar os dados no navegador sem precisar recarregar a página.
- **Coleta automática (harvester)** rodando de fundo a cada 15 minutos.
- Atualização do mapa do navegador a cada 60 segundos.
- Indicador visual "AO VIVO" no cabeçalho.

---

## 🏗️ Arquitetura do Projeto

```
homelab-weather-map/
├── public/
│   ├── index.html          # Interface principal (HTML)
│   ├── app.js              # Lógica do mapa, painéis e recepção do SSE
│   └── style.css           # Estilização completa do painel (dark theme)
├── server/
│   ├── index.js            # Servidor Express + configuração do SSE
│   ├── routes.js           # Rotas da API local
│   ├── consensus.js        # Lógica de cruzamento de dados entre as APIs
│   ├── api-registry.js     # Registro e chamadas das APIs de clima
│   ├── harvester.js        # Script de busca automática e periódica de dados
│   ├── database.js         # Manipulação do banco SQLite via sql.js
│   └── cities.json         # Lista com as 363 cidades monitoradas
├── weather_monitor.db      # Banco de dados SQLite local (gerado automaticamente)
├── package.json
└── README.md
```

---

## 📡 Endpoints da API Local

| Método | Endpoint | Descrição |
|--------|----------|-----------|
| `GET` | `/api/map-data` | Retorna os dados climáticos de todas as cidades cadastradas |
| `GET` | `/api/weather?lat=&lon=` | Busca os dados de uma coordenada específica |
| `GET` | `/api/history?lat=&lon=&hours=24` | Retorna o histórico de 24h de uma coordenada |
| `GET` | `/api/db-stats` | Estatísticas de uso do banco de dados |
| `GET` | `/api/events` | Canal SSE para atualizações instantâneas no front-end |
| `POST` | `/api/harvest` | Força uma nova busca de dados manualmente nas APIs |

---

## 🛠️ Pré-requisitos

- **Node.js** 18 ou superior instalado no servidor/máquina local
- Gerenciador de pacotes **npm**

---

## 📦 Instalação e Execução

```bash
# Clonar o repositório
git clone https://github.com/danielsmendonca/homelab-weather-map.git
cd homelab-weather-map

# Instalar as dependências do Node.js
npm install

# Iniciar o servidor de produção
npm start
```

Após iniciar, o painel estará acessível na sua rede através do endereço: **http://localhost:3000**

---

## 🔧 Modo de Desenvolvimento

Caso queira fazer alterações no código com reinicialização automática do servidor:

```bash
# Iniciar o servidor no modo desenvolvimento (Node.js --watch)
npm run dev
```

---

## ⚙️ Variáveis de Ambiente

Caso queira customizar as portas ou o tempo de atualização, crie um arquivo `.env` na raiz do projeto com as seguintes variáveis:

| Variável | Valor Padrão | Descrição |
|----------|--------------|-----------|
| `PORT` | `3000` | Porta em que o servidor web irá rodar |
| `HARVESTER_INTERVAL` | `15` | Intervalo de busca de novos dados de clima (em minutos) |

---

## 📊 Banco de Dados

O projeto utiliza **SQLite** rodando de forma leve através do [sql.js](https://sql.js.org/) (WebAssembly), eliminando a necessidade de instalar binários ou bancos pesados na sua máquina. O arquivo `weather_monitor.db` é gerado automaticamente na primeira execução.

### Estrutura das Tabelas

**`weather_history`** — Armazena o histórico de todas as medições feitas
- `lat, lon` (REAL): Coordenadas geográficas.
- `timestamp` (TEXT): Data/Hora da medição no padrão ISO 8601.
- `temperature` (REAL): Temperatura em °C.
- `wind_speed` (REAL): Velocidade do vento em km/h.
- `wind_direction` (REAL): Direção do vento em graus.
- `pressure` (REAL): Pressão atmosférica em hPa.
- `humidity` (REAL): Umidade relativa em %.
- `precipitation` (REAL): Volume de chuva em mm.
- `condition` (TEXT): Descrição visual do tempo.
- `country` (TEXT): Código do país (ex: BR, US).
- `city_name` (TEXT): Nome da cidade monitorada.
- `sources` (TEXT): Quais APIs responderam para gerar essa média (formato JSON).

**`harvester_status`** — Salva o estado atual e mais recente de cada ponto monitorado
- `city_name` (TEXT): Nome da cidade (Chave Primária).
- `country` (TEXT): Código do país.
- `lat, lon` (REAL): Coordenadas geográficas.
- `last_update` (TEXT): Último horário em que a cidade foi atualizada.
- `temperature, wind_speed, etc.` (REAL): Dados climáticos da última leitura.
- `condition` (TEXT): Condição atual do clima.

---

## 🎨 Tecnologias Utilizadas

### No Front-end:
- **Leaflet** — Biblioteca leve para renderização do mapa interativo.
- **Chart.js** — Renderização dos gráficos de linha do histórico de forma limpa.
- **TopoJSON** — Desenho das fronteiras dos países de forma extremamente leve (world-atlas 50m).
- **Vanilla JavaScript** — Construído sem frameworks pesados (Zero React/Vue), garantindo desempenho máximo e baixo consumo.

### No Back-end:
- **Express** — Servidor web leve e flexível para rotas e streaming de eventos.
- **sql.js** — SQLite rodando direto na memória via WebAssembly.
- **Fetch API (Nativo)** — Realização das requisições para os provedores externos de clima.

---

## 🤝 Como Contribuir

Fique super à vontade para abrir Issues para relatar bugs, sugerir novas cidades ou propor melhorias!

1. Faça um **Fork** do projeto.
2. Crie uma branch para sua modificação: `git checkout -b feature/minha-melhoria`
3. Salve suas alterações: `git commit -m 'Adiciona funcionalidade X'`
4. Envie para o seu repositório: `git push origin feature/minha-melhoria`
5. Abra um **Pull Request** aqui no repositório principal.

---

## 📝 Licença

Este projeto está sob a licença **MIT**. Veja o arquivo [LICENSE](LICENSE) para mais detalhes.