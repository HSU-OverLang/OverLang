package com.overlang.domain.member.entity;

import jakarta.persistence.*;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

@Entity
@Table(name = "members")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class Member {

  @Id
  @GeneratedValue(strategy = GenerationType.IDENTITY)
  private Long id;

  @Column(nullable = false, unique = true)
  private String email;

  @Column(nullable = false)
  private String name;

  @Column(unique = true, nullable = false)
  private String firebaseUid;

  // 데이터를 넣을 때 쓸 생성자
  public Member(String email, String name, String firebaseUid) {
    this.email = email;
    this.name = name;
    this.firebaseUid = firebaseUid;
  }
}
