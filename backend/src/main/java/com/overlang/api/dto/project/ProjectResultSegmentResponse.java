package com.overlang.api.dto.project;

import com.overlang.domain.segment.entity.SegmentWordType;
import java.util.List;

public record ProjectResultSegmentResponse(
        Long segmentId,
        String translatedText,
        List<ProjectResultSegmentWordResponse> translatedWords) {

    public record ProjectResultSegmentWordResponse(
            Long segmentWordId,
            String word,
            SegmentWordType wordType,
            Double startTime,
            Double endTime) {}
}