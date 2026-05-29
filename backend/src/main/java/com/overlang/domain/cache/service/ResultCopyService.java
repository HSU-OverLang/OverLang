package com.overlang.domain.cache.service;

import com.overlang.domain.job.entity.Job;
import com.overlang.domain.ocr.entity.OcrItem;
import com.overlang.domain.ocr.repository.OcrItemRepository;
import com.overlang.domain.segment.entity.Segment;
import com.overlang.domain.segment.repository.SegmentRepository;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

@Service
@RequiredArgsConstructor
public class ResultCopyService {

  private final SegmentRepository segmentRepository;
  private final OcrItemRepository ocrItemRepository;

  public void copyResults(Job sourceJob, Job targetJob) {
    copySegments(sourceJob, targetJob);
    copyOcrItems(sourceJob, targetJob);
  }

  private Segment copySegment(Segment segment, Job targetJob) {
    return new Segment(
        targetJob,
        segment.getStartTime(),
        segment.getEndTime(),
        segment.getSeq(),
        segment.getText(),
        segment.getTranslatedText(),
        segment.getLanguageCode());
  }

  private void copySegments(Job sourceJob, Job targetJob) {

    List<Segment> sourceSegments = segmentRepository.findByJobIdOrderBySeqAsc(sourceJob.getId());

    List<Segment> copiedSegments =
        sourceSegments.stream().map(segment -> copySegment(segment, targetJob)).toList();
    segmentRepository.saveAll(copiedSegments);
  }

  private OcrItem copyOcrItem(OcrItem item, Job targetJob) {
    return new OcrItem(
        targetJob,
        item.getStartTime(),
        item.getEndTime(),
        item.getOriginText(),
        item.getTranslatedText(),
        item.getX(),
        item.getY(),
        item.getW(),
        item.getH(),
        item.getConfidence(),
        item.getBackgroundColor(),
        item.getDominantBackgroundColor(),
        item.getTextColor(),
        item.getBlurX(),
        item.getBlurY(),
        item.getBlurW(),
        item.getBlurH(),
        item.getFontSizeRatio(),
        item.getFontWeight(),
        item.getTextAlign(),
        item.getAnimationType(),
        item.getAnimationStartTime(),
        item.getAnimationEndTime());
  }

  private void copyOcrItems(Job sourceJob, Job targetJob) {

    List<OcrItem> sourceOcrItems =
        ocrItemRepository.findByJobIdOrderByStartTimeAsc(sourceJob.getId());

    List<OcrItem> copiedOcrItems =
        sourceOcrItems.stream().map(item -> copyOcrItem(item, targetJob)).toList();

    ocrItemRepository.saveAll(copiedOcrItems);
  }
}
