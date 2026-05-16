package com.overlang.domain.savedword.entity;

import com.overlang.domain.common.BaseTimeEntity;
import com.overlang.domain.member.entity.Member;
import com.overlang.domain.segment.entity.SegmentWord;
import jakarta.persistence.*;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

@Entity
@Table(name = "saved_words")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class SavedWord extends BaseTimeEntity {

  @Id
  @GeneratedValue(strategy = GenerationType.IDENTITY)
  private Long id;

  @ManyToOne(fetch = FetchType.LAZY, optional = false)
  @JoinColumn(name = "member_id", nullable = false)
  private Member member;

  @ManyToOne(fetch = FetchType.LAZY, optional = false)
  @JoinColumn(name = "segment_word_id", nullable = false)
  private SegmentWord segmentWord;

  @Column(nullable = false, length = 255)
  private String word;

  @Column(columnDefinition = "TEXT")
  private String meaning;

  @Column(name = "context_meaning", columnDefinition = "TEXT")
  private String contextMeaning;

  @Column(columnDefinition = "TEXT")
  private String memo;

  @Column(name = "matched_expression", nullable = false)
  private boolean matchedExpression;

  public SavedWord(
      Member member,
      SegmentWord segmentWord,
      String word,
      String meaning,
      String contextMeaning,
      String memo,
      boolean matchedExpression) {
    this.member = member;
    this.segmentWord = segmentWord;
    this.word = word;
    this.meaning = meaning;
    this.contextMeaning = contextMeaning;
    this.memo = memo;
    this.matchedExpression = matchedExpression;
  }

  public void updateMemo(String memo) {
    this.memo = memo;
  }
}
