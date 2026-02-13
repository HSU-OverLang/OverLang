package kr.ac.hansung.cse.overlang;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.autoconfigure.jdbc.DataSourceAutoConfiguration;

// @SpringBootApplication
@SpringBootApplication(exclude = {DataSourceAutoConfiguration.class})
public class OverlangBackendApplication {
  public static void main(String[] args) {
    SpringApplication.run(OverlangBackendApplication.class, args);
  }
}
