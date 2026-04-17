package com.overlang.domain.apikey.entity;

import com.overlang.domain.common.BaseTimeEntity;
import com.overlang.domain.member.entity.Member;
import jakarta.persistence.*;
import lombok.*;

@Entity
@Table(name = "user_api_keys")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class UserApiKey extends BaseTimeEntity {

  @Id
  @GeneratedValue(strategy = GenerationType.IDENTITY)
  private Long id;

  @ManyToOne(fetch = FetchType.LAZY, optional = false)
  @JoinColumn(name = "member_id", nullable = false)
  private Member member;

  @Enumerated(EnumType.STRING)
  @Column(nullable = false, length = 50)
  private ApiKeyProvider provider;

  @Column(name = "encrypted_key", nullable = false, columnDefinition = "TEXT")
  private String encryptedKey;

  @Column(name = "is_active", nullable = false)
  private Boolean isActive;

  public UserApiKey(Member member, ApiKeyProvider provider, String encryptedKey, Boolean isActive) {
    this.member = member;
    this.provider = provider;
    this.encryptedKey = encryptedKey;
    this.isActive = isActive != null ? isActive : true;
  }

  public void updateEncryptedKey(String encryptedKey) {
    this.encryptedKey = encryptedKey;
  }

  public void updateIsActive(Boolean isActive) {
    this.isActive = isActive;
  }
}
