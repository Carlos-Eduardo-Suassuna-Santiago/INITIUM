# 🚀 Guia de Implantação do INITIUM (AWS EC2 - Free Tier)

Este guia orienta o deploy completo da plataforma **INITIUM** (Frontend React/Vite + Backend WebSocket Relay) em uma máquina virtual no nível gratuito da **AWS (EC2)**, dimensionada para suportar eventos com mais de 40 jogadores simultâneos com alta estabilidade e custo zero.

---

## 🏗️ Arquitetura de Implantação

O sistema é executado em contêineres Docker leves:
- **Frontend**: Aplicação React 19 compilada e servida por um servidor estático **Nginx Alpine** (porta interna `8080`).
- **Backend**: Servidor **Node.js 22 Alpine** com WebSocket Server puro (`ws`) gerenciando estados em tempo real (porta interna `8788`, exposta publicamente via proxy reverso SSL na porta `8787`).

---

## PASSO 1: Criando a Instância EC2 na AWS

1. Acesse o [Console da AWS](https://aws.amazon.com/pt/console/) e entre no serviço **EC2**.
2. Clique em **Executar Instância** (*Launch Instance*).
3. **Nome da Instância:** `initium-server` (ou nome de sua preferência).
4. **Sistema Operacional (AMI):** Escolha **Ubuntu Server 24.04 LTS** ou **Ubuntu Server 22.04 LTS**.
5. **Tipo de Instância:**
   - Dê preferência à **`t3.micro`** (2 vCPUs, 1 GB RAM - elegível ao Free Tier em várias regiões).
   - Ou utilize a **`t2.micro`** (1 vCPU, 1 GB RAM).
6. **Armazenamento:** Configure para **20 GB a 30 GB gp3** (o nível gratuito permite até 30 GB de EBS).
7. **Par de Chaves:** Selecione ou crie um novo par de chaves (`.pem`) e faça o download seguro para a sua máquina.

### 🛡️ Configuração do Security Group (Firewall)
Nas regras de entrada (*Inbound Rules*), configure:

| Tipo | Porta | Origem | Finalidade |
| :--- | :--- | :--- | :--- |
| **SSH** | `22` | Seu IP (ou Qualquer Lugar `0.0.0.0/0`) | Acesso remoto via terminal |
| **HTTP** | `80` | Qualquer Lugar (`0.0.0.0/0`) | Acesso web padrão / Certificado SSL |
| **HTTPS** | `443` | Qualquer Lugar (`0.0.0.0/0`) | Acesso web seguro (se usar domínio/SSL) |
| **Custom TCP** | `8080` | Qualquer Lugar (`0.0.0.0/0`) | Porta padrão do frontend no docker-compose |
| **Custom TCP** | `8787` | Qualquer Lugar (`0.0.0.0/0`) | Comunicação WebSocket em tempo real |

> [!NOTE]
> Se você optar por alterar o mapeamento do frontend no `docker-compose.yml` para a porta `80` ou usar um proxy reverso (Caddy/Nginx), a abertura da porta `8080` torna-se opcional.

Clique em **Executar Instância** e copie o **Endereço IPv4 Público** atribuído à sua máquina.

---

## PASSO 2: Conexão e Preparação do Ambiente Linux

Acesse sua máquina EC2 pelo terminal do seu computador (ajuste o caminho da sua chave `.pem` e o IP):

```bash
ssh -i /caminho/para/sua-chave.pem ubuntu@IP_PUBLICO_DA_EC2
```

### 1. Criar Memória Swap (2 GB) — *Passo Obrigatório*
Como instâncias do nível gratuito possuem 1 GB de RAM, a memória Swap é essencial para fornecer folga durante a compilação do frontend (`npm run build` do Vite/Tailwind):

```bash
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

Verifique se a Swap está ativa:
```bash
free -h
```

### 2. Atualizar o Sistema e Instalar o Docker
Execute os comandos abaixo para instalar a versão oficial do Docker e Docker Compose:

```bash
sudo apt update && sudo apt upgrade -y
curl -fsSL https://get.docker.com -o get-docker.sh && sudo sh get-docker.sh
sudo usermod -aG docker $USER
```

> **Dica:** Saia do SSH (`exit`) e conecte novamente para que as permissões do grupo Docker sejam aplicadas sem necessidade de `sudo`.

---

## PASSO 3: Clonando o Projeto e Subindo os Contêineres

### 1. Clonar o Repositório
No terminal da EC2:

```bash
git clone <URL_DO_SEU_REPOSITORIO_GIT> initium
cd initium
```

### 2. (Opcional) Ajustar a Porta Padrão do Frontend
Por padrão, o `docker-compose.yml` expõe o frontend na porta `8080`. Se desejar acessá-lo diretamente na porta web padrão `80` (sem precisar digitar `:8080` no navegador):

Abra o arquivo:
```bash
nano docker-compose.yml
```
Altere a linha do serviço `frontend`:
```yaml
    ports:
      - "80:80"  # alterado de 8080:80 para 80:80
```
Salve com `Ctrl + O`, pressione `Enter`, e saia com `Ctrl + X`.

### 3. Iniciar os Serviços com o Docker Compose
Execute a construção e inicialização dos contêineres:

```bash
docker compose up -d --build
```

### 4. Verificar o Status
Confira se ambos os serviços estão rodando com status `Up`:

```bash
docker compose ps
```

E visualize os logs do relay WebSocket:
```bash
docker compose logs -f realtime
```

---

## PASSO 4: Acessando a Aplicação

Abra o navegador e acerte o endereço:

- **Se manteve a porta 8080:** `http://IP_PUBLICO_DA_EC2:8080`
- **Se alterou para a porta 80:** `http://IP_PUBLICO_DA_EC2`
- **Painel Administrativo:** `http://IP_PUBLICO_DA_EC2:8080/admin` (ou `/admin`)

O frontend detecta automaticamente o IP da URL no navegador e conecta os jogadores ao WebSocket na porta `8787`.

---

## PASSO 5: (Recomendado) Configurando Domínio e HTTPS com Caddy

Para evitar avisos de navegador sobre conexões não seguras e garantir tráfego criptografado (`https://` e `wss://`), o uso do servidor web **Caddy** é a alternativa mais simples, pois ele gera e renova certificados SSL (Let's Encrypt) de forma 100% automatizada.

### 1. Instalar o Caddy
```bash
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update && sudo apt install -y caddy
```

### 2. Configurar o Caddyfile
Edite o arquivo `/etc/caddy/Caddyfile`:

```bash
sudo nano /etc/caddy/Caddyfile
```

Substitua todo o conteúdo por:
```caddyfile
seu-dominio.com {
    # Roteamento do Frontend
    reverse_proxy localhost:8080
}

# Porta dedicada para o WebSocket seguro (WSS) com o mesmo certificado SSL
seu-dominio.com:8787 {
    reverse_proxy localhost:8788
}
```

Recarregue o Caddy:
```bash
sudo systemctl reload caddy
```

> [!NOTE]
> Se usar subdomínio para o WebSocket (ex: `realtime.seu-dominio.com`), crie o arquivo `Frontend/.env.production` com a variável `VITE_REALTIME_URL=wss://realtime.seu-dominio.com` antes de gerar o build do Docker (`docker compose up -d --build`).

---

## 🛠️ Comandos Úteis de Operação

| Tarefa | Comando |
| :--- | :--- |
| **Ver logs em tempo real** | `docker compose logs -f` |
| **Ver consumo de CPU e RAM dos contêineres** | `docker stats` |
| **Reiniciar a aplicação** | `docker compose restart` |
| **Parar a aplicação** | `docker compose down` |
| **Atualizar o sistema após alterações no Git** | `git pull && docker compose up -d --build` |
