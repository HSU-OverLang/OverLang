package com.overlang.domain.member.service;

import org.springframework.dao.DataIntegrityViolationException;
import com.overlang.domain.member.entity.Member;
import com.overlang.domain.member.repository.MemberRepository;
import com.overlang.global.auth.UnauthorizedException;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class MemberService {

    private final MemberRepository memberRepository;

    public record MemberWithStatus(Member member, boolean isNewMember) {}

    @Transactional
    public MemberWithStatus findOrCreate(String firebaseUid, String email, String name) {
        if (email == null || email.isBlank()) {
            throw new UnauthorizedException("Firebase token does not contain email");
        }

        // 조회를 시도
        return memberRepository.findByFirebaseUid(firebaseUid)
                .map(member -> new MemberWithStatus(member, false)) // 이미 있으면 기존 유저(false)
                .orElseGet(() -> {
                    // 없으면 생성
                    Member newMember = createSafely(firebaseUid, email, name);
                    return new MemberWithStatus(newMember, true); // 새로 만들었으면 true
                });
    }

    private Member createSafely(String firebaseUid, String email, String name) {
        try {
            String finalName = (name != null && !name.isBlank()) ? name : defaultName(email);
            return memberRepository.save(new Member(email, finalName, firebaseUid));
        } catch (DataIntegrityViolationException e) {
            return memberRepository.findByFirebaseUid(firebaseUid)
                    .orElseThrow(() -> e);
        }
    }

    private String defaultName(String email) {
        return email.split("@")[0];
    }
}