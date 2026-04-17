package com.overlang.domain.member.entity;

import com.overlang.domain.common.BaseTimeEntity;
import jakarta.persistence.*;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

@Entity
@Table(name = "members")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class Member extends BaseTimeEntity {

  @Id
  @GeneratedValue(strategy = GenerationType.IDENTITY)
  private Long id;

  @Column(nullable = false, unique = true, length = 255)
  private String email;

  @Column(nullable = false, length = 255)
  private String name;

  @Column(name = "firebase_uid", unique = true, nullable = false, length = 255)
  private String firebaseUid;

  @Column(name = "profile_image_url", length = 1024)
  private String profileImageUrl;

  // 생성자
  public Member(String email, String name, String firebaseUid) {
    this.email = email;
    this.name = name;
    this.firebaseUid = firebaseUid;
  }

  // 프로필 이미지 수정
  public void updateProfileImage(String profileImageUrl) {
    this.profileImageUrl = profileImageUrl;
  }

  // 이름 수정
  public void updateName(String name) {
    this.name = name;
  }
}
