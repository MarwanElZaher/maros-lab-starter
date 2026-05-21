.PHONY: deploy-realestate

deploy-realestate:
	git pull && docker compose -f docker/docker-compose.realestate.yml --env-file docker/.env.realestate up -d --build
