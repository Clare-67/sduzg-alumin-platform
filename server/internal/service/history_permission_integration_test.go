package service

import (
	"context"
	"errors"
	"fmt"
	"os"
	"testing"
	"time"

	"github.com/JunLang-7/sduzg-alumin-platform/server/internal/common"
	"github.com/JunLang-7/sduzg-alumin-platform/server/internal/dto"
	"github.com/JunLang-7/sduzg-alumin-platform/server/internal/model"
	"github.com/JunLang-7/sduzg-alumin-platform/server/internal/repository"
	"gorm.io/driver/mysql"
	"gorm.io/gorm"
)

// TestHistoryPermissionsAndReview verifies the server-side boundary: an
// administrator can review only assigned domains, while a super administrator
// can review all domains. The transaction is always rolled back.
func TestHistoryPermissionsAndReview(t *testing.T) {
	dsn := os.Getenv("TEST_MYSQL_DSN")
	if dsn == "" {
		t.Skip("TEST_MYSQL_DSN is not configured")
	}
	db, err := gorm.Open(mysql.Open(dsn), &gorm.Config{})
	if err != nil {
		t.Fatalf("open test database: %v", err)
	}
	sqlDB, err := db.DB()
	if err != nil {
		t.Fatalf("get sql database: %v", err)
	}
	t.Cleanup(func() { _ = sqlDB.Close() })

	var undergraduate, mpa model.DataDomain
	if err := db.Where("code = ?", common.DataDomainUndergraduate).First(&undergraduate).Error; err != nil {
		t.Fatalf("find undergraduate domain: %v", err)
	}
	if err := db.Where("code = ?", common.DataDomainMPA).First(&mpa).Error; err != nil {
		t.Fatalf("find MPA domain: %v", err)
	}

	rollback := errors.New("rollback history permission test transaction")
	err = db.Transaction(func(tx *gorm.DB) error {
		ctx := context.Background()
		tag := fmt.Sprintf("history-permission-%d", time.Now().UnixNano())
		undergraduateID, mpaID := undergraduate.ID, mpa.ID
		undergraduateContribution := &model.HistoryContribution{
			Title: tag + "-undergraduate", Content: "本科投稿内容", SourceNote: "测试来源",
			Status: repository.HistoryContributionPending, DataDomainID: &undergraduateID, AuthorUserID: 1101, AuthorAlumniID: 2101,
		}
		mpaContribution := &model.HistoryContribution{
			Title: tag + "-mpa", Content: "MPA 投稿内容", SourceNote: "测试来源",
			Status: repository.HistoryContributionPending, DataDomainID: &mpaID, AuthorUserID: 1102, AuthorAlumniID: 2102,
		}
		draft := &model.HistoryContribution{
			Title: tag + "-draft", Content: "草稿内容", SourceNote: "测试来源",
			Status: repository.HistoryContributionDraft, DataDomainID: &mpaID, AuthorUserID: 1102, AuthorAlumniID: 2102,
		}
		returned := &model.HistoryContribution{
			Title: tag + "-returned", Content: "待补充内容", SourceNote: "测试来源",
			Status: repository.HistoryContributionReturned, DataDomainID: &mpaID, AuthorUserID: 1102, AuthorAlumniID: 2102,
		}
		rejected := &model.HistoryContribution{
			Title: tag + "-rejected", Content: "待驳回内容", SourceNote: "测试来源",
			Status: repository.HistoryContributionPending, DataDomainID: &mpaID, AuthorUserID: 1102, AuthorAlumniID: 2102,
		}
		for _, contribution := range []*model.HistoryContribution{undergraduateContribution, mpaContribution, draft, returned, rejected} {
			if err := tx.Create(contribution).Error; err != nil {
				return err
			}
		}
		if err := tx.Create(&model.HistoryAttachment{ContributionID: mpaContribution.ID, ObjectKey: tag + "/attachment.pdf", OriginalName: "review.pdf", MimeType: "application/pdf", Description: "测试附件", SourceNote: "测试来源", RightsNote: "测试授权", ConsentConfirmed: true, Status: "pending"}).Error; err != nil {
			return err
		}

		svc := NewHistoryService(repository.NewHistoryRepository(tx), nil)
		mpaAdmin := common.AccessContext{UserID: 7001, Role: common.RoleAdmin, DomainIDs: []uint64{mpaID}}
		superAdmin := common.AccessContext{UserID: 7002, Role: common.RoleSuperAdmin}
		alumni := common.AccessContext{UserID: 1102, Role: common.RoleAlumni}

		pending, err := svc.ListPending(ctx, mpaAdmin)
		if err != nil || len(pending) != 2 || pending[0].ID != mpaContribution.ID {
			t.Errorf("MPA pending = %+v, err %v; want MPA pending contributions", pending, err)
		}
		allPending, err := svc.ListPending(ctx, superAdmin)
		if err != nil || len(allPending) != 3 {
			t.Errorf("super-admin pending count = %d, err %v; want 3", len(allPending), err)
		}
		mine, err := svc.ListMine(ctx, alumni)
		if err != nil || len(mine) != 4 {
			t.Errorf("alumni mine count = %d, err %v; want 4 own contributions", len(mine), err)
		}
		if _, err := svc.ListMine(ctx, mpaAdmin); !errors.Is(err, common.ErrPermissionDenied) {
			t.Errorf("admin ListMine error = %v, want permission denied", err)
		}
		attachments, err := svc.ListAttachments(ctx, mpaAdmin, mpaContribution.ID)
		if err != nil || len(attachments) != 1 || attachments[0].OriginalName != "review.pdf" {
			t.Errorf("in-domain attachments = %+v, err %v", attachments, err)
		}
		if _, err := svc.ListAttachments(ctx, mpaAdmin, undergraduateContribution.ID); !errors.Is(err, common.ErrPermissionDenied) {
			t.Errorf("out-of-domain attachments error = %v, want permission denied", err)
		}
		if _, err := svc.ListAttachments(ctx, alumni, mpaContribution.ID); !errors.Is(err, common.ErrPermissionDenied) {
			t.Errorf("alumni attachments error = %v, want permission denied", err)
		}
		resubmitted, err := svc.Submit(ctx, alumni, returned.ID)
		if err != nil || resubmitted.Status != repository.HistoryContributionPending {
			t.Errorf("returned resubmit = %+v, err %v; want pending", resubmitted, err)
		}
		rejectedResult, err := svc.Review(ctx, mpaAdmin, rejected.ID, dto.HistoryReviewRequest{Action: "reject", ReviewComment: "资料不完整"})
		if err != nil || rejectedResult.Status != repository.HistoryContributionRejected {
			t.Errorf("reject result = %+v, err %v; want rejected", rejectedResult, err)
		}
		if _, err := svc.Review(ctx, mpaAdmin, undergraduateContribution.ID, dto.HistoryReviewRequest{Action: "approve"}); !errors.Is(err, common.ErrPermissionDenied) {
			t.Errorf("out-of-domain review error = %v, want permission denied", err)
		}
		if _, err := svc.Review(ctx, mpaAdmin, mpaContribution.ID, dto.HistoryReviewRequest{Action: "return"}); !errors.Is(err, common.ErrInvalidRequest) {
			t.Errorf("return without comment error = %v, want invalid request", err)
		}
		approved, err := svc.Review(ctx, mpaAdmin, mpaContribution.ID, dto.HistoryReviewRequest{Action: "approve"})
		if err != nil || approved.Status != repository.HistoryContributionApproved || approved.EntryID == nil {
			t.Errorf("approve result = %+v, err %v; want approved contribution with entry", approved, err)
		}
		if _, err := svc.Review(ctx, superAdmin, undergraduateContribution.ID, dto.HistoryReviewRequest{Action: "reject", ReviewComment: "资料不完整"}); err != nil {
			t.Errorf("super-admin cross-domain reject: %v", err)
		}
		var versions int64
		if err := tx.Model(&model.HistoryEntryVersion{}).Where("contribution_id = ?", mpaContribution.ID).Count(&versions).Error; err != nil {
			return err
		}
		if versions != 1 {
			t.Errorf("approved contribution versions = %d, want 1", versions)
		}
		return rollback
	})
	if !errors.Is(err, rollback) {
		t.Fatalf("history permission transaction: %v", err)
	}
}
