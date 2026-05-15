package com.overlang.domain.project.service;

import com.overlang.api.dto.project.*;
import com.overlang.domain.file.service.S3UploadService;
import com.overlang.domain.job.entity.Job;
import com.overlang.domain.job.repository.JobRepository;
import com.overlang.domain.member.entity.Member;
import com.overlang.domain.member.repository.MemberRepository;
import com.overlang.domain.ocr.repository.OcrItemRepository;
import com.overlang.domain.project.entity.Project;
import com.overlang.domain.project.entity.SourceType;
import com.overlang.domain.project.repository.ProjectRepository;
import com.overlang.domain.savedword.repository.SavedWordRepository;
import com.overlang.domain.segment.entity.Segment;
import com.overlang.domain.segment.entity.SegmentWord;
import com.overlang.domain.segment.entity.SegmentWordType;
import com.overlang.domain.segment.repository.SegmentRepository;
import com.overlang.domain.segment.repository.SegmentWordRepository;
import com.overlang.global.util.YoutubeUrlUtils;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
@Transactional
public class ProjectService {

  private static final String WORD_SPLIT_REGEX = "\\s+";

  private final ProjectRepository projectRepository;
  private final MemberRepository memberRepository;
  private final S3UploadService s3UploadService;
  private final JobRepository jobRepository;
  private final SegmentRepository segmentRepository;
  private final SegmentWordRepository segmentWordRepository;
  private final OcrItemRepository ocrItemRepository;
  private final SavedWordRepository savedWordRepository;

  public ProjectCreateResponse createProject(Long memberId, ProjectCreateRequest request) {
    Member member =
        memberRepository
            .findById(memberId)
            .orElseThrow(() -> new IllegalArgumentException("존재하지 않는 회원입니다."));

    String youtubeVideoId = null;

    if (request.sourceType() == SourceType.YOUTUBE) {
      youtubeVideoId = YoutubeUrlUtils.extractVideoId(request.sourceUrl());
    }

    Project project =
        new Project(
            member,
            request.title(),
            request.sourceType(),
            request.sourceUrl(),
            youtubeVideoId,
            request.fileUrl(),
            request.fileKey());

    Project savedProject = projectRepository.save(project);

    return new ProjectCreateResponse(
        savedProject.getId(),
        member.getId(),
        savedProject.getTitle(),
        savedProject.getSourceType(),
        savedProject.getSourceUrl(),
        savedProject.getFileUrl(),
        savedProject.getFileKey(),
        savedProject.getStatus(),
        savedProject.getCreatedAt());
  }

  @Transactional(readOnly = true)
  public List<ProjectResponse> getProjects(Long memberId) {
    return projectRepository.findByMemberIdOrderByCreatedAtDesc(memberId).stream()
        .map(
            project ->
                new ProjectResponse(
                    project.getId(),
                    project.getTitle(),
                    project.getSourceType(),
                    project.getSourceUrl(),
                    project.getFileUrl(),
                    project.getStatus(),
                    project.getCreatedAt()))
        .toList();
  }

  @Transactional(readOnly = true)
  public ProjectDetailResponse getProject(Long memberId, Long projectId) {
    Project project =
        projectRepository
            .findByIdAndMemberId(projectId, memberId)
            .orElseThrow(() -> new IllegalArgumentException("해당 프로젝트를 찾을 수 없습니다."));

    return new ProjectDetailResponse(
        project.getId(),
        project.getMember().getId(),
        project.getTitle(),
        project.getSourceType(),
        project.getSourceUrl(),
        project.getFileUrl(),
        project.getStatus(),
        project.getCreatedAt());
  }

  @Transactional(readOnly = true)
  public String getVideoPresignedUrl(Long memberId, Long projectId) {
    Project project =
        projectRepository
            .findByIdAndMemberId(projectId, memberId)
            .orElseThrow(() -> new IllegalArgumentException("해당 프로젝트를 찾을 수 없습니다."));

    if (project.getFileKey() == null || project.getFileKey().isBlank()) {
      throw new IllegalArgumentException("업로드된 영상이 없습니다.");
    }

    return s3UploadService.generatePresignedGetUrl(project.getFileKey());
  }

  public ProjectUpdateResponse updateProject(
      Long memberId, Long projectId, ProjectUpdateRequest request) {

    Project project =
        projectRepository
            .findByIdAndMemberId(projectId, memberId)
            .orElseThrow(() -> new IllegalArgumentException("해당 프로젝트를 찾을 수 없습니다."));

    project.updateTitle(request.title());

    return ProjectUpdateResponse.from(project);
  }

  public ProjectDeleteResponse deleteProject(Long memberId, Long projectId) {
    Project project =
        projectRepository
            .findByIdAndMemberId(projectId, memberId)
            .orElseThrow(() -> new IllegalArgumentException("해당 프로젝트를 찾을 수 없습니다."));

    List<Job> jobs = jobRepository.findByProjectId(projectId);

    savedWordRepository.deleteByProjectId(projectId);

    for (Job job : jobs) {
      Long jobId = job.getId();

      ocrItemRepository.deleteByJobId(jobId);
      segmentWordRepository.deleteBySegmentJobId(jobId);
      segmentRepository.deleteByJobId(jobId);
    }

    jobRepository.deleteByProjectId(projectId);
    if (project.getSourceType() == SourceType.UPLOAD) {
      s3UploadService.deleteFile(project.getFileKey());
    }
    projectRepository.delete(project);

    return new ProjectDeleteResponse(projectId, true);
  }

  @Transactional
  public ProjectResultUpdateResponse updateProjectResults(
      Long projectId, Long memberId, ProjectResultUpdateRequest request) {
    Project project = findProjectByIdAndMemberId(projectId, memberId);
    List<Long> segmentIds =
        request.segments().stream().map(ProjectResultSegmentUpdateRequest::segmentId).toList();

    List<Segment> segments = segmentRepository.findByIdIn(segmentIds);

    if (segments.size() != segmentIds.size()) {
      throw new IllegalArgumentException("존재하지 않는 segment가 포함되어 있습니다.");
    }
    boolean hasInvalidSegment =
        segments.stream()
            .anyMatch(segment -> !segment.getJob().getProject().getId().equals(projectId));

    if (hasInvalidSegment) {
      throw new IllegalArgumentException("다른 프로젝트의 segment는 수정할 수 없습니다.");
    }
    savedWordRepository.deleteBySegmentIdsAndWordType(segmentIds, SegmentWordType.TRANSLATION);

    segmentWordRepository.deleteBySegmentIdInAndWordType(segmentIds, SegmentWordType.TRANSLATION);
    Map<Long, String> translatedTextBySegmentId =
        request.segments().stream()
            .collect(
                Collectors.toMap(
                    ProjectResultSegmentUpdateRequest::segmentId,
                    ProjectResultSegmentUpdateRequest::translatedText));

    segments.forEach(
        segment -> segment.updateTranslatedText(translatedTextBySegmentId.get(segment.getId())));
    List<SegmentWord> newTranslatedWords = createTranslationSegmentWords(segments);

    List<SegmentWord> savedTranslatedWords = segmentWordRepository.saveAll(newTranslatedWords);

    Map<Long, List<ProjectResultSegmentResponse.ProjectResultSegmentWordResponse>>
        translatedWordsBySegmentId =
            savedTranslatedWords.stream()
                .collect(
                    Collectors.groupingBy(
                        segmentWord -> segmentWord.getSegment().getId(),
                        Collectors.mapping(
                            segmentWord ->
                                new ProjectResultSegmentResponse.ProjectResultSegmentWordResponse(
                                    segmentWord.getId(),
                                    segmentWord.getWord(),
                                    segmentWord.getWordType(),
                                    segmentWord.getStartTime(),
                                    segmentWord.getEndTime()),
                            Collectors.toList())));

    List<ProjectResultSegmentResponse> segmentResponses =
        segments.stream()
            .map(
                segment ->
                    new ProjectResultSegmentResponse(
                        segment.getId(),
                        segment.getTranslatedText(),
                        translatedWordsBySegmentId.getOrDefault(segment.getId(), List.of())))
            .toList();

    return new ProjectResultUpdateResponse(project.getId(), segmentResponses);
  }

  private Project findProjectByIdAndMemberId(Long projectId, Long memberId) {
    return projectRepository
        .findByIdAndMemberId(projectId, memberId)
        .orElseThrow(() -> new IllegalArgumentException("프로젝트를 찾을 수 없습니다."));
  }

  private List<SegmentWord> createTranslationSegmentWords(List<Segment> segments) {
    List<SegmentWord> segmentWords = new ArrayList<>();

    for (Segment segment : segments) {
      String translatedText = segment.getTranslatedText();

      if (translatedText == null || translatedText.isBlank()) {
        continue;
      }

      String[] words = translatedText.split(WORD_SPLIT_REGEX);

      int seq = 1;

      for (String rawWord : words) {
        String cleanedWord = rawWord.replaceAll("^[\\p{Punct}]+|[\\p{Punct}]+$", "");

        if (cleanedWord.isBlank()) {
          continue;
        }

        segmentWords.add(
            new SegmentWord(
                segment,
                seq++,
                segment.getStartTime(),
                segment.getEndTime(),
                cleanedWord,
                SegmentWordType.TRANSLATION));
      }
    }
    return segmentWords;
  }
}
