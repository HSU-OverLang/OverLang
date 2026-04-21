package com.overlang.domain.segment.entity;

import jakarta.persistence.*;
import lombok.*;

@Entity
@Table(name = "segment_words")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class SegmentWord {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "segment_id", nullable = false)
    private Segment segment;

    @Column(nullable = false)
    private Integer seq;

    @Column(name = "start_time", nullable = false)
    private Double startTime;

    @Column(name = "end_time", nullable = false)
    private Double endTime;

    @Column(nullable = false, length = 255)
    private String word;

    public SegmentWord(
            Segment segment,
            Integer seq,
            Double startTime,
            Double endTime,
            String word
    ) {
        this.segment = segment;
        this.seq = seq;
        this.startTime = startTime;
        this.endTime = endTime;
        this.word = word;
    }
}
