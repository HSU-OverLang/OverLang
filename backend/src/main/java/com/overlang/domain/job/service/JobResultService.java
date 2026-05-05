package com.overlang.domain.job.service;

import com.overlang.api.dto.ocr.OcrItemResponse;
import com.overlang.api.dto.segment.SegmentResponse;
import com.overlang.domain.ocr.repository.OcrItemRepository;
import com.overlang.domain.segment.repository.SegmentRepository;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class JobResultService {

  private final SegmentRepository segmentRepository;
  private final OcrItemRepository ocrItemRepository;

  @Transactional(readOnly = true)
  public List<SegmentResponse> getSegments(Long jobId) {
    return segmentRepository.findByJobIdOrderBySeqAsc(jobId).stream()
        .map(SegmentResponse::from)
        .toList();
  }

  @Transactional(readOnly = true)
  public List<OcrItemResponse> getOcrItems(Long jobId) {
    return ocrItemRepository.findByJobIdOrderByStartTimeAsc(jobId).stream()
        .map(OcrItemResponse::from)
        .toList();
  }
}
