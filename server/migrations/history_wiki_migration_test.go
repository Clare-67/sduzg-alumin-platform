package migrations

import (
	"os"
	"strings"
	"testing"
)

func TestHistoryWikiMigrationDefinesCoreTablesAndAttachmentRules(t *testing.T) {
	migration, err := os.ReadFile("008_add_history_wiki.sql")
	if err != nil {
		t.Fatalf("read history wiki migration: %v", err)
	}
	content := string(migration)
	for _, want := range []string{
		"CREATE TABLE IF NOT EXISTS history_entries",
		"CREATE TABLE IF NOT EXISTS history_entry_versions",
		"CREATE TABLE IF NOT EXISTS history_contributions",
		"CREATE TABLE IF NOT EXISTS history_attachments",
		"data_domain_id",
		"author_user_id",
		"review_comment",
		"consent_confirmed",
	} {
		if !strings.Contains(content, want) {
			t.Errorf("history migration does not contain %q", want)
		}
	}
}
