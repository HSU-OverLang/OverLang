package com.overlang.domain.member.service;

import com.overlang.api.dto.member.ProfileImageUploadResponse;
import com.overlang.domain.file.service.S3UploadService;
import com.overlang.domain.member.entity.Member;
import com.overlang.domain.member.repository.MemberRepository;
import com.overlang.global.auth.UnauthorizedException;
import lombok.RequiredArgsConstructor;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

@Service
@RequiredArgsConstructor
public class MemberService {

  private final MemberRepository memberRepository;
  private final S3UploadService s3UploadService;

  public record MemberWithStatus(Member member, boolean isNewMember) {}

  /** 로그인/회원가입 전용 - 있으면 조회 - 없으면 생성 */
  @Transactional
  public MemberWithStatus findOrCreate(String firebaseUid, String email, String name) {
    if (email == null || email.isBlank()) {
      throw new UnauthorizedException("Firebase token does not contain email");
    }

    return memberRepository
        .findByFirebaseUid(firebaseUid)
        .map(member -> new MemberWithStatus(member, false))
        .orElseGet(
            () -> {
              Member newMember = createSafely(firebaseUid, email, name);
              return new MemberWithStatus(newMember, true);
            });
  }

  /** 조회 전용 (/me) - 절대 생성하지 않음 */
  @Transactional(readOnly = true)
  public Member getByFirebaseUid(String firebaseUid) {
    return memberRepository
        .findByFirebaseUid(firebaseUid)
        .orElseThrow(() -> new UnauthorizedException("Member not found"));
  }

  private Member createSafely(String firebaseUid, String email, String name) {
    try {
      String finalName = (name != null && !name.isBlank()) ? name : defaultName(email);
      return memberRepository.save(new Member(email, finalName, firebaseUid));
    } catch (DataIntegrityViolationException e) {
      // 동시성으로 이미 생성된 경우 재조회
      return memberRepository.findByFirebaseUid(firebaseUid).orElseThrow(() -> e);
    }
  }

  private String defaultName(String email) {
    return email.split("@")[0];
  }

  @Transactional
  public ProfileImageUploadResponse uploadProfileImage(Long memberId, MultipartFile file) {

    Member member = findMemberById(memberId);
    String oldProfileImageUrl = member.getProfileImageUrl();

    String newProfileImageUrl = s3UploadService.uploadProfileImage(file, memberId);

    member.updateProfileImage(newProfileImageUrl);

    if (oldProfileImageUrl != null && !oldProfileImageUrl.isBlank()) {
      s3UploadService.deleteFileByUrl(oldProfileImageUrl);
    }

    return new ProfileImageUploadResponse(newProfileImageUrl);
  }

  private Member findMemberById(Long memberId) {
    return memberRepository
        .findById(memberId)
        .orElseThrow(() -> new UnauthorizedException("Member not found"));
  }
}
