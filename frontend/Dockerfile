FROM nginxinc/nginx-unprivileged:1.28-alpine
USER root
RUN mkdir -p /etc/nginx/templates && chmod 755 /etc/nginx/templates
COPY --chmod=644 index.html /usr/share/nginx/html/index.html
COPY --chmod=644 app.js /usr/share/nginx/html/app.js
COPY --chmod=644 default.conf.template /etc/nginx/templates/default.conf.template
USER 101
EXPOSE 8080
