package com.overlang.domain.member.service;

import com.google.firebase.auth.FirebaseAuth;
import com.google.firebase.auth.FirebaseAuthException;
import com.overlang.domain.file.service.S3UploadService;
import com.overlang.domain.member.entity.Member;
import com.overlang.domain.member.repository.MemberRepository;
import com.overlang.domain.project.entity.Project;
import com.overlang.domain.project.repository.ProjectRepository;
import com.overlang.domain.project.service.ProjectService;
import com.overlang.domain.savedword.repository.SavedWordRepository;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
@Transactional
public class MemberWithdrawService {

  private final MemberRepository memberRepository;
  private final ProjectRepository projectRepository;
  private final ProjectService projectService;
  private final SavedWordRepository savedWordRepository;
  private final S3UploadService s3UploadService;

  public void withdraw(Long memberId) {

    Member member =
        memberRepository
            .findById(memberId)
            .orElseThrow(() -> new IllegalArgumentException("존재하지 않는 회원입니다."));

    List<Project> projects = projectRepository.findByMemberIdOrderByCreatedAtDesc(memberId);

    for (Project project : projects) {
      projectService.deleteProject(memberId, project.getId());
    }

    savedWordRepository.deleteByMemberId(memberId);

    s3UploadService.deleteFileByUrl(member.getProfileImageUrl());

    try {
      FirebaseAuth.getInstance().deleteUser(member.getFirebaseUid());
    } catch (FirebaseAuthException e) {
      throw new IllegalArgumentException("Firebase 회원 삭제 중 오류가 발생했습니다.");
    }

    memberRepository.delete(member);
  }
}
