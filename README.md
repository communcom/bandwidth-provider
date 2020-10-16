# Bandwidth service

#### Clone the repository

```bash
git clone https://github.com/communcom/bandwidth-provider.git
cd bandwidth-provider
```

#### Create .env file

```bash
cp .env.example .env
```

Add variables

```bash
GLS_CYBERWAY_HTTP_URL=http://cyberway-node:3000
GLS_PROVIDER_PUBLIC_KEY=public key
GLS_PROVIDER_WIF=private key
GLS_PROVIDER_USERNAME=account
GLS_PRISM_CONNECT=http://prism-node:3000
GLS_REGISTRATION_CONNECT=http://registration-node:3000
```

#### Create docker-compose file

```bash
cp docker-compose.example.yml docker-compose.yml
```

#### Run

```bash
docker-compose up -d --build
```
