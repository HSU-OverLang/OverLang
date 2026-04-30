package com.overlang.domain.job.queue;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
public class JobQueueProducer {

  private static final String JOB_QUEUE_KEY = "job-queue";

  private final StringRedisTemplate redisTemplate;
  private final ObjectMapper objectMapper;

  public void enqueue(JobQueuePayload payload) {
    try {
      String jsonPayload = objectMapper.writeValueAsString(payload);
      redisTemplate.opsForList().rightPush(JOB_QUEUE_KEY, jsonPayload);
    } catch (JsonProcessingException e) {
      throw new IllegalStateException("Job queue payload 직렬화에 실패했습니다.", e);
    }
  }
}
