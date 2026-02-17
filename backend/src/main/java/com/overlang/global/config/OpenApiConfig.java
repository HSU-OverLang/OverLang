package com.overlang.global.config;

import io.swagger.v3.oas.models.Components;
import io.swagger.v3.oas.models.OpenAPI;
import io.swagger.v3.oas.models.info.Info;
import io.swagger.v3.oas.models.security.SecurityRequirement;
import io.swagger.v3.oas.models.security.SecurityScheme;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class OpenApiConfig {

  @Bean
  public OpenAPI openAPI() {
    String securityJwtName = "BearerAuth";
    SecurityRequirement securityRequirement = new SecurityRequirement().addList(securityJwtName);

    Components components =
        new Components()
            .addSecuritySchemes(
                securityJwtName,
                new SecurityScheme()
                    .name(securityJwtName)
                    .type(SecurityScheme.Type.HTTP)
                    .scheme("bearer")
                    .bearerFormat("JWT"));

    return new OpenAPI()
        .info(
            new Info()
                .title("OverLang API 명세서")
                .description("OverLang 프로젝트의 백엔드 API 문서입니다.")
                .version("v1.0.0"))
        .addSecurityItem(securityRequirement)
        .components(components);
  }
}
