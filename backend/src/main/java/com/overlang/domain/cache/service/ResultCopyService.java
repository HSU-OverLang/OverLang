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

  private void copySegments(Job sourceJob, Job targetJob) {

    List<Segment> sourceSegments = segmentRepository.findByJobIdOrderBySeqAsc(sourceJob.getId());

    List<Segment> copiedSegments =
        sourceSegments.stream()
            .map(
                segment ->
                    new Segment(
                        targetJob,
                        segment.getStartTime(),
                        segment.getEndTime(),
                        segment.getSeq(),
                        segment.getText(),
                        segment.getTranslatedText(),
                        segment.getLanguageCode()))
            .toList();

    segmentRepository.saveAll(copiedSegments);
  }

  private void copyOcrItems(Job sourceJob, Job targetJob) {

    List<OcrItem> sourceOcrItems =
        ocrItemRepository.findByJobIdOrderByStartTimeAsc(sourceJob.getId());

    List<OcrItem> copiedOcrItems =
        sourceOcrItems.stream()
            .map(
                item ->
                    new OcrItem(
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
                        item.getBlurH()))
            .toList();

    ocrItemRepository.saveAll(copiedOcrItems);
  }
}
