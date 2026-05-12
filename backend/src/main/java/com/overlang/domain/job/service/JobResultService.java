package com.overlang.domain.job.service;

import com.overlang.api.dto.ocr.OcrItemResponse;
import com.overlang.api.dto.segment.SegmentResponse;
import com.overlang.api.dto.segment.SegmentWordResponse;
import com.overlang.domain.job.repository.JobRepository;
import com.overlang.domain.ocr.repository.OcrItemRepository;
import com.overlang.domain.segment.repository.SegmentRepository;
import com.overlang.domain.segment.repository.SegmentWordRepository;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class JobResultService {

  private final SegmentRepository segmentRepository;
  private final SegmentWordRepository segmentWordRepository;
  private final OcrItemRepository ocrItemRepository;
  private final JobRepository jobRepository;

  @Transactional(readOnly = true)
  public List<SegmentResponse> getSegments(Long jobId, Long memberId) {
    validateJobOwner(jobId, memberId);
    return segmentRepository.findByJobIdOrderBySeqAsc(jobId).stream()
        .map(
            segment -> {
              List<SegmentWordResponse> words =
                  segmentWordRepository.findBySegmentIdOrderBySeqAsc(segment.getId()).stream()
                      .map(SegmentWordResponse::from)
                      .toList();

              return SegmentResponse.from(segment, words);
            })
        .toList();
  }

  @Transactional(readOnly = true)
  public List<OcrItemResponse> getOcrItems(Long jobId, Long memberId) {
    validateJobOwner(jobId, memberId);
    return ocrItemRepository.findByJobIdOrderByStartTimeAsc(jobId).stream()
        .map(OcrItemResponse::from)
        .toList();
  }

  private void validateJobOwner(Long jobId, Long memberId) {
    if (!jobRepository.existsByIdAndProjectMemberId(jobId, memberId)) {
      throw new IllegalArgumentException("작업을 찾을 수 없습니다.");
    }
  }
}
