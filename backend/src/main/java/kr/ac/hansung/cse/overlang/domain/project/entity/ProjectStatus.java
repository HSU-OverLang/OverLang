package kr.ac.hansung.cse.overlang.domain.project.entity;

public enum ProjectStatus {
  CREATED, // 프로젝트 생성됨
  PROCESSING, // AI 분석 중
  COMPLETED, // 분석 완료
  FAILED // 분석 실패
}
