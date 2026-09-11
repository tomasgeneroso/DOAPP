#!/bin/bash

# Script para instalar certificado SSL en VPS Ubuntu
# Ejecutar con: sudo bash install-ssl.sh

set -e

echo "🔐 Instalando certificado SSL para doapparg.com..."

# Colores para output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Verificar que se ejecuta como root
if [ "$EUID" -ne 0 ]; then
    echo -e "${RED}❌ Este script debe ejecutarse con sudo${NC}"
    exit 1
fi

# 1. Instalar Certbot
echo -e "${YELLOW}📦 Instalando Certbot...${NC}"
apt update
apt install -y certbot python3-certbot-nginx

# 2. Obtener certificado SSL
echo -e "${YELLOW}🔒 Obteniendo certificado SSL de Let's Encrypt...${NC}"
# El dominio viejo va en el mismo certificado. Sigue recibiendo tráfico -- de
# enlaces que ya circulan y de buscadores que todavía lo tienen indexado -- y
# sin certificado válido el navegador muestra una advertencia ANTES de llegar a
# redirigir. Una advertencia de seguridad en la puerta espanta más gente que un
# dominio viejo.
certbot --nginx \
  -d doapparg.com -d www.doapparg.com \
  -d doapparg.site -d www.doapparg.site \
  --non-interactive --agree-tos --email admin@doapparg.com --redirect

# 3. Verificar la configuración
echo -e "${YELLOW}✅ Verificando configuración de Nginx...${NC}"
nginx -t

if [ $? -eq 0 ]; then
    # 4. Recargar Nginx
    echo -e "${YELLOW}🔄 Recargando Nginx...${NC}"
    systemctl reload nginx

    echo -e "${GREEN}✅ SSL instalado correctamente!${NC}"
    echo -e "${GREEN}🌐 Tu sitio ahora está disponible en https://doapparg.com${NC}"
    echo ""
    echo -e "${YELLOW}📋 Próximos pasos:${NC}"
    echo "1. Actualizar cookies a secure: true en auth.ts"
    echo "2. Configurar renovación automática (ya configurada por Certbot)"
    echo "3. Verificar que HTTPS funciona: curl -I https://doapparg.com"
else
    echo -e "${RED}❌ Error en la configuración de Nginx${NC}"
    exit 1
fi

# 5. Configurar renovación automática (verificar)
echo -e "${YELLOW}🔄 Verificando renovación automática...${NC}"
certbot renew --dry-run

echo ""
echo -e "${GREEN}✅ Configuración completa!${NC}"
echo -e "Certificado válido por 90 días, se renovará automáticamente."
