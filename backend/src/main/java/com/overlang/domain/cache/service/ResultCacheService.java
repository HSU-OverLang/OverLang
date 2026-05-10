package com.overlang.domain.cache.service;

import com.overlang.api.dto.job.JobCreateRequest;
import com.overlang.domain.job.entity.Job;
import com.overlang.domain.job.entity.JobStatus;
import com.overlang.domain.job.repository.JobRepository;
import com.overlang.domain.project.entity.Project;
import com.overlang.domain.project.entity.SourceType;
import java.util.Optional;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;

@Service
@RequiredArgsConstructor
public class ResultCacheService {

  private final JobRepository jobRepository;

  public Optional<Job> findReusableJob(Project project, JobCreateRequest request) {
    if (project.getSourceType() == SourceType.YOUTUBE) {
      return findReusableYoutubeJob(project, request);
    }

    return Optional.empty();
  }

  private Optional<Job> findReusableYoutubeJob(Project project, JobCreateRequest request) {
    if (project.getYoutubeVideoId() == null || project.getYoutubeVideoId().isBlank()) {
      return Optional.empty();
    }

    return jobRepository
        .findReusableYoutubeJobs(
            SourceType.YOUTUBE,
            project.getYoutubeVideoId(),
            JobStatus.COMPLETED,
            request.sourceLanguage(),
            request.targetLanguage(),
            request.translationProvider(),
            PageRequest.of(0, 1))
        .stream()
        .findFirst();
  }
}
